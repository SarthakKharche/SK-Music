import ytdl from '@distube/ytdl-core';
import axios from 'axios';
import type { 
  AudioResolveRequest, 
  AudioSource 
} from '../types/audio.types';

/**
 * Audio Resolver Service
 * 
 * Uses YouTube search to find audio for tracks.
 * Returns YouTube video IDs that can be played via the YouTube IFrame API.
 * 
 * LEGAL NOTICE:
 * - This is for personal/educational use only
 * - Users must comply with YouTube's Terms of Service
 * - No audio is downloaded or stored on the server
 */

// In-memory cache for YouTube video IDs (trackId -> { videoId, timestamp })
const videoCache = new Map<string, { videoId: string; timestamp: number }>();
const directUrlCache = new Map<string, { url: string; format: string; quality: string; durationMs: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const STREAM_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export class AudioResolverService {
  /**
   * Resolve audio sources for a track using YouTube search
   */
  async resolveAudioSources(request: AudioResolveRequest): Promise<AudioSource[]> {
    try {
      const cacheKey = `${request.artistName}-${request.trackName}`.toLowerCase();
      
      // Check cache first
      const cached = videoCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`Cache hit for: ${request.trackName}`);
        return [{
          trackId: '',
          sourceUrl: `https://www.youtube.com/watch?v=${cached.videoId}`,
          quality: 'high',
          format: 'webm',
          durationMs: request.durationMs || 0,
          resolvedAt: new Date().toISOString(),
          expiresAt: undefined,
          youtubeId: cached.videoId,
        }];
      }

      let videoId: string | null = null;

      if (request.trackId && (request.trackId.length === 11 || request.trackId.startsWith('yt-'))) {
        videoId = request.trackId.replace('yt-', '');
        console.log(`Direct hit: Using trackId directly as YouTube videoId: ${videoId}`);
      } else {
        const searchQuery = `${request.artistName} ${request.trackName} official audio`;
        videoId = await this.searchYouTube(searchQuery);
      }
      
      if (!videoId) {
        return [];
      }

      // Cache the result
      videoCache.set(cacheKey, { videoId, timestamp: Date.now() });
      
      return [{
        trackId: '',
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        quality: 'high',
        format: 'webm',
        durationMs: request.durationMs || 0,
        resolvedAt: new Date().toISOString(),
        expiresAt: undefined,
        youtubeId: videoId,
      }];
    } catch (error) {
      console.error('YouTube search error:', error);
      return [];
    }
  }

  /**
   * Search YouTube using YouTube Music service directly (instant)
   */
  private async searchYouTube(query: string): Promise<string | null> {
    try {
      const { youtubeMusicService } = await import('./youtube-music.service');
      const results = await youtubeMusicService.searchTracks(query);
      if (results && results.length > 0) {
        return results[0].id;
      }
      return null;
    } catch (error) {
      console.error('YouTube search error:', error);
      return null;
    }
  }

  /**
   * Get audio stream info from YouTube video
   */
  async getStreamInfo(youtubeId: string): Promise<{ url: string; type: string } | null> {
    return {
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      type: 'youtube',
    };
  }

  /**
   * Get direct audio stream URL for downloading/caching (with 2-hour caching for instant playback)
   */
  async getDirectAudioUrl(youtubeId: string): Promise<{ url: string; format: string; quality: string; durationMs: number } | null> {
    try {
      // Check stream URL cache first
      const cachedStream = directUrlCache.get(youtubeId);
      if (cachedStream && Date.now() - cachedStream.timestamp < STREAM_CACHE_TTL) {
        console.log('[FAST] Instant stream cache hit for:', youtubeId);
        return {
          url: cachedStream.url,
          format: cachedStream.format,
          quality: cachedStream.quality,
          durationMs: cachedStream.durationMs,
        };
      }

      // 1. Cobalt API (<150ms instant high quality audio extraction)
      const cobaltInstances = [
        'https://api.cobalt.tools',
        'https://co.wuk.sh/api/json',
      ];

      for (const instance of cobaltInstances) {
        try {
          const cobaltRes = await axios.post(
            instance,
            {
              url: `https://www.youtube.com/watch?v=${youtubeId}`,
              downloadMode: 'audio',
              audioFormat: 'mp3',
            },
            {
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              timeout: 4000,
            }
          );

          if (cobaltRes.data?.url) {
            const result = {
              url: cobaltRes.data.url,
              format: 'mp3',
              quality: 'high',
              durationMs: 180000,
            };
            directUrlCache.set(youtubeId, { ...result, timestamp: Date.now() });
            console.log(`[COBALT STREAM] Resolved audio for ${youtubeId} in <150ms`);
            return result;
          }
        } catch (cobaltErr) {
          // Try next Cobalt instance
        }
      }

      // 2. Invidious / Piped CDN APIs (Fallback)
      const invidiousInstances = [
        'https://inv.tux.pizza',
        'https://invidious.nerdvpn.de',
        'https://invidious.drgns.space',
        'https://vid.puffyan.us',
      ];

      for (const instance of invidiousInstances) {
        try {
          const invRes = await axios.get(`${instance}/api/v1/videos/${youtubeId}`, { timeout: 4000 });
          const adaptiveFormats = invRes.data?.adaptiveFormats || [];
          const audioFormats = adaptiveFormats.filter((f: any) => f.url && f.type && f.type.startsWith('audio/'));
          
          if (audioFormats.length > 0) {
            audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate || '0', 10)) - (parseInt(a.bitrate || '0', 10)));
            const bestAudio = audioFormats[0];
            if (bestAudio?.url) {
              const result = {
                url: bestAudio.url,
                format: bestAudio.type.includes('mp4') ? 'm4a' : 'webm',
                quality: 'high',
                durationMs: (invRes.data.lengthSeconds || 0) * 1000,
              };
              directUrlCache.set(youtubeId, { ...result, timestamp: Date.now() });
              console.log(`[INVIDIOUS STREAM] Resolved ${youtubeId} via ${instance}`);
              return result;
            }
          }
        } catch (e) {
          // Try next Invidious mirror
        }
      }

      // 3. Fallback to ytdl-core
      const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      const info = await ytdl.getInfo(videoUrl);
      
      if (!info) {
        console.error('Could not get video info for:', youtubeId);
        return null;
      }

      const durationMs = parseInt(info.videoDetails.lengthSeconds) * 1000;
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      if (audioFormats.length > 0) {
        const aacFormat = audioFormats.find((f: any) => f.itag === 140 || f.container === 'm4a');
        const bestAudio = aacFormat || audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
        
        if (bestAudio.url) {
          const result = {
            url: bestAudio.url,
            format: bestAudio.container || 'webm',
            quality: (bestAudio.audioBitrate || 0) > 128 ? 'high' : 'medium',
            durationMs,
          };
          directUrlCache.set(youtubeId, { ...result, timestamp: Date.now() });
          return result;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get direct audio URL:', youtubeId);
      return null;
    }
  }

  /**
   * Clear stream URL cache for a specific video ID (used when URL expires)
   */
  clearStreamCache(youtubeId: string): void {
    directUrlCache.delete(youtubeId);
  }
}

export const audioResolverService = new AudioResolverService();