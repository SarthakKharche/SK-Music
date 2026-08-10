import api from '../utils/api';
import { indexedDB } from './indexedDB';
import type { Track, AudioSource, CachedAudio, OfflineSyncStatus } from '../types';

/**
 * Audio Cache Manager
 * Handles audio downloading, caching, and playback
 * 
 * CRITICAL: Audio files are stored LOCALLY only, never in cloud
 */
class AudioCacheManager {
  private downloadQueue: Map<string, Promise<void>> = new Map();
  private syncStatusListeners: Set<(status: OfflineSyncStatus) => void> = new Set();

  /**
   * Resolve audio source URL for a track
   */
  async resolveAudioSource(track: Track): Promise<AudioSource | null> {
    try {
      const response = await api.post<{ sources: AudioSource[] }>('/audio/resolve', {
        trackId: track.id,
        trackName: track.name,
        artistName: track.artists[0]?.name,
        albumName: track.album.name,
        durationMs: track.durationMs,
        isrc: track.isrc,
      });

      if (response.data.sources && response.data.sources.length > 0) {
        // Prefer high quality, fallback to medium/low
        const source =
          response.data.sources.find((s) => s.quality === 'high') ||
          response.data.sources.find((s) => s.quality === 'medium') ||
          response.data.sources[0];

        return {
          ...source,
          trackId: track.id,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to resolve audio source:', error);
      return null;
    }
  }

  /**
   * Get audio URL for playback (cache-first strategy)
   * Also triggers background download for offline availability
   */
  async getAudioUrl(track: Track): Promise<string | null> {
    // Check if cached audio blob exists
    const cached = await indexedDB.getCachedAudio(track.id);
    
    if (cached) {
      // Return blob URL from cache
      console.log('Using cached audio for:', track.name);
      return URL.createObjectURL(cached.blob);
    }

    // Check if we have a previously resolved YouTube ID in localStorage
    const storedYoutubeId = localStorage.getItem(`youtube_${track.id}`);
    
    // If offline, we can't play without cached audio
    if (!navigator.onLine) {
      if (storedYoutubeId) {
        // Can't stream YouTube offline - need cached blob
        console.log('Offline: No cached audio available for:', track.name);
      }
      return null;
    }

    // Resolve audio source URL for online streaming via native HTML5 Audio (enables background playback & lockscreen controls on mobile)
    const cleanTitle = (track.name || 'Song').replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const primaryArtist = track.artists?.[0]?.name?.split(',')[0]?.split('&')[0]?.trim() || '';
    const searchQuery = encodeURIComponent(`${cleanTitle} ${primaryArtist}`.trim());

    const baseUrl = api.defaults.baseURL || '/api';
    const streamUrl = `${baseUrl}/audio/saavn-search?query=${searchQuery}&trackId=${encodeURIComponent(track.id)}`;

    console.log('[AUDIO URL] Returning native HTML5 audio stream URL for background playback:', cleanTitle);
    return streamUrl;
  }

  /**
   * Download audio in background for offline availability
   */
  async downloadForOffline(track: Track, youtubeId: string): Promise<void> {
    console.log('[OFFLINE] downloadForOffline called:', track.name, youtubeId);
    
    // Check if already cached
    const isCached = await indexedDB.isAudioCached(track.id);
    if (isCached) {
      console.log('[OFFLINE] Already cached:', track.name);
      return;
    }

    // Prevent duplicate downloads
    if (this.downloadQueue.has(track.id)) {
      console.log('[OFFLINE] Already downloading:', track.name);
      return;
    }

    console.log('[OFFLINE] Starting background download for offline:', track.name);

    const downloadPromise = (async () => {
      await this._downloadFromYouTube(track);
    })();
    this.downloadQueue.set(track.id, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      this.downloadQueue.delete(track.id);
    }
  }

  private async _downloadFromYouTube(track: Track): Promise<CachedAudio> {
    const cleanTitle = (track.name || 'Song').replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const primaryArtist = track.artists?.[0]?.name?.split(',')[0]?.split('&')[0]?.trim() || '';
    const query = encodeURIComponent(`${cleanTitle} ${primaryArtist}`.trim());

    this.notifySyncStatus({
      trackId: track.id,
      status: 'downloading',
      progress: 10,
    });

    console.log('[OFFLINE] Fetching audio binary for:', cleanTitle);

    let targetTrackId = track.id;

    // Resolve or retrieve YouTube ID for track
    let storedYoutubeId = localStorage.getItem(`youtube_${track.id}`);
    if (!storedYoutubeId && track.id.startsWith('yt-')) {
      storedYoutubeId = track.id.replace('yt-', '');
    }

    if (!storedYoutubeId && navigator.onLine) {
      this.notifySyncStatus({
        trackId: track.id,
        status: 'downloading',
        progress: 25,
      });
      const resolved = await this.resolveAudioSource(track);
      if (resolved?.youtubeId) {
        storedYoutubeId = resolved.youtubeId;
        localStorage.setItem(`youtube_${track.id}`, storedYoutubeId);
      }
    }

    if (storedYoutubeId) {
      targetTrackId = `yt-${storedYoutubeId}`;
    }

    this.notifySyncStatus({
      trackId: track.id,
      status: 'downloading',
      progress: 40,
    });

    let blob: Blob | null = null;

    // Fetch audio stream via Axios api.get with explicit audio Accept headers & download flag
    try {
      const audioResponse = await api.get(`/audio/saavn-search?query=${query}&trackId=${targetTrackId}&download=true`, {
        responseType: 'blob',
        timeout: 35000,
        headers: {
          'Accept': 'audio/mpeg, audio/mp4, audio/aac, audio/*, application/octet-stream',
        },
      });

      let rawData = audioResponse.data;

      // Handle cases where response is a small JSON blob containing direct CDN url
      if (rawData && rawData.size < 5000) {
        try {
          const textData = await rawData.text();
          const jsonParsed = JSON.parse(textData);
          if (jsonParsed && jsonParsed.url) {
            console.log('[OFFLINE] Fetching direct CDN audio binary:', jsonParsed.url.substring(0, 60));
            const directRes = await fetch(jsonParsed.url);
            if (directRes.ok) {
              rawData = await directRes.blob();
            }
          }
        } catch {
          // Not JSON
        }
      }

      if (rawData && rawData.size >= 30000) {
        blob = rawData;
        this.notifySyncStatus({
          trackId: track.id,
          status: 'downloading',
          progress: 80,
        });
      }
    } catch (err) {
      console.warn('[OFFLINE] Axios API download failed:', err);
    }

    if (!blob || blob.size < 30000) {
      this.notifySyncStatus({
        trackId: track.id,
        status: 'failed',
        progress: 0,
        error: 'Downloaded audio binary is incomplete or unavailable',
      });
      throw new Error('Downloaded audio binary is incomplete or unavailable');
    }

    // Calculate 100% exact real audio duration from binary blob using Web Audio API decodeAudioData
    let realDurationMs = track.durationMs || 0;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await blob.slice(0).arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      if (audioBuffer && audioBuffer.duration > 0) {
        realDurationMs = Math.round(audioBuffer.duration * 1000);
      }
      audioCtx.close().catch(() => {});
    } catch {
      // Fallback if decodeAudioData fails
    }

    if (!realDurationMs || realDurationMs <= 0) {
      realDurationMs = track.durationMs || 180000;
    }

    const cleanName = track.name || (track as any).title || 'Song';
    const cleanArtists = track.artists && track.artists.length > 0
      ? track.artists
      : [{ id: 'artist-1', name: (track as any).subtitle || (track as any).artist || 'SK Music' }];
    const cleanAlbum = track.album?.name
      ? track.album
      : { id: 'album-1', name: cleanName, imageUrl: (track as any).imageUrl || '/placeholder-album.png' };

    const updatedTrack: Track = {
      ...track,
      name: cleanName,
      artists: cleanArtists,
      album: cleanAlbum,
      durationMs: realDurationMs,
    };

    const cachedAudio: CachedAudio = {
      trackId: track.id,
      blob,
      format: 'mp3',
      quality: 'high',
      durationMs: realDurationMs,
      cachedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      sizeBytes: blob.size,
      track: updatedTrack,
    };

    await indexedDB.cacheAudio(cachedAudio);
    console.log(`✅ Downloaded for offline: ${track.name} (${(blob.size / 1024 / 1024).toFixed(2)} MB, duration: ${Math.floor(realDurationMs / 1000)}s)`);

    // Sync download preference to user account across devices
    try {
      await api.post('/user/offline-preferences', {
        trackIds: [track.id],
        track: updatedTrack,
        isOfflinePreferred: true,
      });
    } catch (syncErr) {
      console.warn('[OFFLINE SYNC] Account preference sync optional:', syncErr);
    }

    this.notifySyncStatus({
      trackId: track.id,
      status: 'cached',
      progress: 100,
    });

    return cachedAudio;
  }



  /**
   * Download and cache audio
   */
  async cacheAudio(track: Track, _source?: AudioSource): Promise<void> {
    const trackId = track.id;

    // Prevent duplicate downloads
    if (this.downloadQueue.has(trackId)) {
      return this.downloadQueue.get(trackId);
    }

    const downloadPromise = (async () => {
      await this._downloadFromYouTube(track);
    })();

    this.downloadQueue.set(trackId, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      this.downloadQueue.delete(trackId);
    }
  }



  /**
   * Batch download tracks for offline use
   */
  async downloadTracksForOffline(tracks: Track[]): Promise<void> {
    const uncached = [];

    for (const track of tracks) {
      const isCached = await indexedDB.isAudioCached(track.id);
      if (!isCached) {
        uncached.push(track);
      }
    }

    // Download in parallel (limit to 3 concurrent downloads)
    const concurrency = 3;
    for (let i = 0; i < uncached.length; i += concurrency) {
      const batch = uncached.slice(i, i + concurrency);
      await Promise.all(batch.map((track) => this.cacheAudio(track)));
    }
  }

  /**
   * Remove cached audio
   */
  async removeCachedAudio(trackId: string): Promise<void> {
    await indexedDB.deleteCachedAudio(trackId);
  }

  /**
   * Check if track is cached
   */
  async isTrackCached(trackId: string): Promise<boolean> {
    return indexedDB.isAudioCached(trackId);
  }

  /**
   * Get cache size
   */
  async getCacheSize(): Promise<number> {
    return indexedDB.getCacheSize();
  }

  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<void> {
    await indexedDB.clearAllCache();
  }

  /**
   * Manage cache size (LRU eviction)
   */
  async manageCacheSize(maxSizeBytes: number = 1024 * 1024 * 1024): Promise<void> {
    await indexedDB.clearOldCache(maxSizeBytes);
  }

  /**
   * Subscribe to sync status updates
   */
  onSyncStatus(callback: (status: OfflineSyncStatus) => void): () => void {
    this.syncStatusListeners.add(callback);
    return () => this.syncStatusListeners.delete(callback);
  }

  /**
   * Notify sync status listeners
   */
  private notifySyncStatus(status: OfflineSyncStatus): void {
    this.syncStatusListeners.forEach((listener) => listener(status));
  }
}

// Export singleton instance
export const audioCacheManager = new AudioCacheManager();
