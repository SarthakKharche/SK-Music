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
    const cleanTitle = track.name.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const primaryArtist = track.artists?.[0]?.name?.split(',')[0]?.split('&')[0]?.trim() || '';
    const query = encodeURIComponent(`${cleanTitle} ${primaryArtist}`);

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

    // Fetch audio stream via Axios api.get (handles CORS & base URL)
    try {
      const audioResponse = await api.get(`/audio/saavn-search?query=${query}&trackId=${targetTrackId}`, {
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

    // Client-side direct mirror fallback if server endpoint was 404 or incomplete
    if (!blob && navigator.onLine) {
      console.log('[OFFLINE] Triggering client-side direct mirror stream extraction for:', cleanTitle);
      this.notifySyncStatus({
        trackId: track.id,
        status: 'downloading',
        progress: 60,
      });
      blob = await this._fetchDirectAudioBlob(storedYoutubeId, query);
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

    const cachedAudio: CachedAudio = {
      trackId: track.id,
      blob,
      format: 'mp3',
      quality: 'high',
      durationMs: track.durationMs || 180000,
      cachedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      sizeBytes: blob.size,
      track,
    };

    await indexedDB.cacheAudio(cachedAudio);
    console.log(`✅ Downloaded for offline: ${track.name} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

    this.notifySyncStatus({
      trackId: track.id,
      status: 'cached',
      progress: 100,
    });

    return cachedAudio;
  }

  /**
   * Helper to fetch audio binary directly from public CORS-enabled audio mirrors
   */
  private async _fetchDirectAudioBlob(youtubeId: string | null, queryStr: string): Promise<Blob | null> {
    let targetYtId = youtubeId;

    if (!targetYtId && navigator.onLine) {
      const pipedSearchMirrors = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.adminforge.de',
        'https://api.piped.private.coffee'
      ];
      for (const instance of pipedSearchMirrors) {
        try {
          const res = await fetch(`${instance}/search?q=${queryStr}&filter=music_songs`);
          if (res.ok) {
            const data = await res.json();
            const firstItem = data?.items?.[0];
            if (firstItem?.url) {
              const match = firstItem.url.match(/v=([a-zA-Z0-9_-]{11})/);
              if (match?.[1]) {
                targetYtId = match[1];
                break;
              }
            }
          }
        } catch {}
      }
    }

    if (!targetYtId) return null;

    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.adminforge.de',
      'https://api.piped.private.coffee'
    ];

    for (const instance of pipedInstances) {
      try {
        const streamRes = await fetch(`${instance}/streams/${targetYtId}`);
        if (streamRes.ok) {
          const streamData = await streamRes.json();
          const audioStreams = streamData?.audioStreams;
          if (audioStreams && audioStreams.length > 0) {
            audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            const streamUrl = audioStreams[0].url;
            if (streamUrl) {
              console.log('[CLIENT DIRECT STREAM] Fetching binary audio directly from:', streamUrl.substring(0, 60));
              const blobRes = await fetch(streamUrl);
              if (blobRes.ok) {
                const blob = await blobRes.blob();
                if (blob.size > 30000) {
                  return blob;
                }
              }
            }
          }
        }
      } catch {}
    }

    const invidiousInstances = [
      'https://inv.tux.pizza',
      'https://invidious.nerdvpn.de',
      'https://vid.puffyan.us'
    ];

    for (const instance of invidiousInstances) {
      try {
        const invRes = await fetch(`${instance}/api/v1/videos/${targetYtId}`);
        if (invRes.ok) {
          const invData = await invRes.json();
          const adaptive = invData?.adaptiveFormats || [];
          const audioFormats = adaptive.filter((f: any) => f.url && f.type && f.type.startsWith('audio/'));
          if (audioFormats.length > 0) {
            audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate || '0', 10)) - (parseInt(a.bitrate || '0', 10)));
            const streamUrl = audioFormats[0].url;
            if (streamUrl) {
              const blobRes = await fetch(streamUrl);
              if (blobRes.ok) {
                const blob = await blobRes.blob();
                if (blob.size > 30000) {
                  return blob;
                }
              }
            }
          }
        }
      } catch {}
    }

    return null;
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
