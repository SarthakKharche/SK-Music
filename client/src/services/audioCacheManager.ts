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

    // Resolve audio source from YouTube (online only)
    const source = await this.resolveAudioSource(track);

    if (!source) {
      // If we have a stored YouTube ID as fallback, use it
      if (storedYoutubeId) {
        console.log('Fallback: Using stored YouTube ID for:', track.name);
        return `youtube:${storedYoutubeId}`;
      }
      console.warn('No audio source found for track:', track.name);
      return null;
    }

    // Return YouTube video ID formatted for YouTube IFrame Audio Player Engine
    if (source.youtubeId) {
      console.log('Using YouTube source for:', track.name, source.youtubeId);
      localStorage.setItem(`youtube_${track.id}`, source.youtubeId);
      
      return `youtube:${source.youtubeId}`;
    }

    // For direct audio URLs, cache in background
    this.cacheAudio(track, source);

    return source.sourceUrl;
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

  /**
   * Download audio from JioSaavn CDN directly in browser
   */
  private async _downloadFromYouTube(track: Track): Promise<CachedAudio> {
    let resolvedTrack = { ...track };

    // If track metadata is missing or "Unknown Track", fetch oEmbed metadata
    if ((!resolvedTrack.name || resolvedTrack.name.toLowerCase().includes('unknown')) && navigator.onLine) {
      let ytId = resolvedTrack.id;
      if (ytId.startsWith('yt-')) ytId = ytId.replace('yt-', '');

      if (ytId && ytId.length === 11) {
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
          if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            if (oembed?.title) {
              resolvedTrack.name = oembed.title;
              resolvedTrack.artists = [{ id: 'artist-1', name: oembed.author_name || 'YouTube Music' }];
              resolvedTrack.album = { id: 'album-1', name: 'YouTube Music', imageUrl: oembed.thumbnail_url || '' };
            }
          }
        } catch (oeErr) {
          console.warn('[OFFLINE] oEmbed metadata resolution skipped:', oeErr);
        }
      }
    }

    const cleanTitle = (resolvedTrack.name || 'Song').replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const primaryArtist = resolvedTrack.artists?.[0]?.name?.split(',')[0]?.split('&')[0]?.trim() || '';

    this.notifySyncStatus({
      trackId: resolvedTrack.id,
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
    const rawSearchQuery = `${cleanTitle} ${primaryArtist}`.trim();

    // Fetch audio stream via Axios api.get (handles CORS & base URL)
    try {
      const audioResponse = await api.get('/audio/saavn-search', {
        params: {
          query: rawSearchQuery,
          trackId: targetTrackId,
        },
        responseType: 'blob',
        timeout: 30000,
      });

      if (audioResponse.data && audioResponse.data.size >= 30000) {
        blob = audioResponse.data;
        this.notifySyncStatus({
          trackId: track.id,
          status: 'downloading',
          progress: 80,
        });
      }
    } catch (err) {
      console.warn('[OFFLINE] Axios API download failed:', err);
    }

    // Fallback attempt via native fetch using correct backend base URL
    if (!blob) {
      try {
        const baseUrl = api.defaults.baseURL || '/api';
        const fallbackUrl = `${baseUrl}/audio/saavn-search?query=${encodeURIComponent(rawSearchQuery)}&trackId=${encodeURIComponent(targetTrackId)}`;
        const fetchRes = await fetch(fallbackUrl);
        if (fetchRes.ok) {
          const fetchedBlob = await fetchRes.blob();
          if (fetchedBlob.size >= 30000) {
            blob = fetchedBlob;
          }
        }
      } catch (fetchErr) {
        console.warn('[OFFLINE] Native fetch download failed:', fetchErr);
      }
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

    // Calculate exact real audio duration from binary blob metadata
    const realDurationMs = await new Promise<number>((resolve) => {
      try {
        const tempAudio = document.createElement('audio');
        const tempUrl = URL.createObjectURL(blob);
        tempAudio.src = tempUrl;
        tempAudio.onloadedmetadata = () => {
          const duration = Math.round(tempAudio.duration * 1000);
          URL.revokeObjectURL(tempUrl);
          resolve(duration && !isNaN(duration) && duration > 0 ? duration : (track.durationMs || 180000));
        };
        tempAudio.onerror = () => {
          URL.revokeObjectURL(tempUrl);
          resolve(track.durationMs || 180000);
        };
      } catch {
        resolve(track.durationMs || 180000);
      }
    });

    const updatedTrack = {
      ...track,
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
