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

    const downloadPromise = this._downloadFromYouTube(track, youtubeId);
    this.downloadQueue.set(track.id, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      this.downloadQueue.delete(track.id);
    }
  }

  /**
   * Download audio from YouTube via server (proxied to avoid CORS)
   */
  private async _downloadFromYouTube(track: Track, youtubeId: string): Promise<void> {
    try {
      this.notifySyncStatus({
        trackId: track.id,
        status: 'downloading',
        progress: 0,
      });

      console.log('[OFFLINE] Resolving audio stream URL for:', youtubeId);
      
      let audioBlobUrl: string | null = null;

      const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.adminforge.de',
        'https://pipedapi.tokhmi.xyz',
        'https://piped-api.garudalinux.org',
      ];

      for (const instance of pipedInstances) {
        try {
          const res = await fetch(`${instance}/streams/${youtubeId}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.audioStreams?.length > 0) {
              audioBlobUrl = data.audioStreams[0].url;
              break;
            }
          }
        } catch {
          // Try next Piped instance
        }
      }

      if (!audioBlobUrl) {
        audioBlobUrl = `${import.meta.env.VITE_API_URL || '/api'}/audio/download/${youtubeId}`;
      }

      const audioResponse = await fetch(audioBlobUrl);

      if (!audioResponse.ok) {
        throw new Error(`Audio download failed: ${audioResponse.status}`);
      }

      // Get metadata from response headers
      const format = audioResponse.headers.get('X-Audio-Format') || 'webm';
      const quality = audioResponse.headers.get('X-Audio-Quality') || 'medium';
      const durationMs = parseInt(audioResponse.headers.get('X-Audio-Duration') || '0') || track.durationMs;
      const contentLength = parseInt(audioResponse.headers.get('content-length') || '0');

      console.log('[OFFLINE] Streaming audio from server, format:', format, 'size:', contentLength);

      const reader = audioResponse.body?.getReader();
      
      if (!reader) {
        throw new Error('No response body');
      }

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;

        // Update progress
        const progress = contentLength > 0 
          ? (receivedLength / contentLength) * 100 
          : 0;
        
        this.notifySyncStatus({
          trackId: track.id,
          status: 'downloading',
          progress,
        });
      }

      // Create valid audio blob from chunks
      const mimeType = format && format !== 'webm' ? `audio/${format}` : 'audio/mp4';
      const blob = new Blob(chunks as BlobPart[], { type: mimeType });

      if (blob.size < 100000) {
        throw new Error('Downloaded audio blob is corrupt or incomplete');
      }

      // Save to IndexedDB with track metadata
      const cachedAudio: CachedAudio = {
        trackId: track.id,
        blob,
        format: format,
        quality: quality as 'low' | 'medium' | 'high',
        durationMs: durationMs,
        cachedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        sizeBytes: blob.size,
        track, // Store track metadata for offline display
      };

      await indexedDB.cacheAudio(cachedAudio);

      this.notifySyncStatus({
        trackId: track.id,
        status: 'cached',
        progress: 100,
      });

      console.log(`✅ Downloaded for offline: ${track.name} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      console.error('[OFFLINE] Failed to download:', track.name, error);
      
      this.notifySyncStatus({
        trackId: track.id,
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Download failed',
      });
    }
  }

  /**
   * Download and cache audio
   */
  async cacheAudio(track: Track, source?: AudioSource): Promise<void> {
    const trackId = track.id;

    // Prevent duplicate downloads
    if (this.downloadQueue.has(trackId)) {
      return this.downloadQueue.get(trackId);
    }

    const downloadPromise = (async () => {
      let youtubeId = localStorage.getItem(`youtube_${track.id}`) || 
                      (track.id.startsWith('yt-') ? track.id.replace('yt-', '') : null);
      
      // If the ID itself looks like a YouTube ID (length 11), use it directly
      if (!youtubeId && track.id.length === 11) {
        youtubeId = track.id;
      }

      // If we don't have the YouTube ID, resolve it via the API
      if (!youtubeId || youtubeId.length !== 11) {
        const resolved = source || await this.resolveAudioSource(track);
        if (resolved?.youtubeId) {
          youtubeId = resolved.youtubeId;
          localStorage.setItem(`youtube_${track.id}`, youtubeId);
        }
      }

      if (!youtubeId || youtubeId.length !== 11) {
        throw new Error('No YouTube ID available for this track');
      }

      // Call the internal downloader directly to avoid queue key conflicts
      await this._downloadFromYouTube(track, youtubeId);
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
