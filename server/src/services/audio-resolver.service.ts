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

      // 2. InnerTube Android /player API (<150ms instant response)
      try {
        const innertubeRes = await axios.post(
          `https://music.youtube.com/youtubei/v1/player?key=AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE`,
          {
            context: {
              client: {
                clientName: 'ANDROID',
                clientVersion: '17.31.35',
                androidSdkVersion: 30,
              },
            },
            videoId: youtubeId,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'com.google.android.apps.youtube.music/5.16.51 (Linux; U; Android 11; GLO-LX3 Build/HUAWEIGLO-LX3; Cronet/102.0.5005.125)',
            },
            timeout: 3000,
          }
        );

        const streamingData = innertubeRes.data?.streamingData;
        const formats = [
          ...(streamingData?.adaptiveFormats || []),
          ...(streamingData?.formats || []),
        ];
        const audioFormats = formats.filter((f: any) => f.url && (f.mimeType?.startsWith('audio/') || f.audioQuality || f.audioBitrate));

        if (audioFormats.length > 0) {
          // Sort by bitrate (highest quality first)
          audioFormats.sort((a: any, b: any) => (b.bitrate || b.audioBitrate || 0) - (a.bitrate || a.audioBitrate || 0));
          
          // Prioritize clean AAC / mp4a formats or highest bitrate stream
          const aacFormat = audioFormats.find((f: any) => f.itag === 140 || (f.mimeType && f.mimeType.includes('mp4a')));
          const opusFormat = audioFormats.find((f: any) => f.itag === 251 || (f.mimeType && f.mimeType.includes('opus')));
          const bestAudio = aacFormat || opusFormat || audioFormats[0];

          if (bestAudio?.url) {
            const durationMs = parseInt(streamingData?.videoDetails?.lengthSeconds || '0', 10) * 1000;
            const isMp4 = bestAudio.mimeType ? bestAudio.mimeType.includes('mp4') : true;
            const result = {
              url: bestAudio.url,
              format: isMp4 ? 'm4a' : 'webm',
              quality: (bestAudio.bitrate || bestAudio.audioBitrate || 0) > 128000 ? 'high' : 'medium',
              durationMs,
            };
            directUrlCache.set(youtubeId, { ...result, timestamp: Date.now() });
            console.log(`[INSTANT STREAM] InnerTube resolved ${youtubeId} (${result.format}) in <150ms`);
            return result;
          }
        }
      } catch (innertubeErr) {
        console.warn(`[FAST STREAM] InnerTube fallback to ytdl for ${youtubeId}`);
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