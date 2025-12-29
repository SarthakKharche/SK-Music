import axios from 'axios';
import ytdl from '@distube/ytdl-core';
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
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests

// Request queue for serializing requests
const requestQueue: Array<{
  query: string;
  resolve: (videoId: string | null) => void;
}> = [];
let isProcessingQueue = false;

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

      const searchQuery = `${request.artistName} ${request.trackName} official audio`;
      
      // Use rate-limited YouTube search
      const videoId = await this.searchYouTubeWithRateLimit(searchQuery);
      
      if (!videoId) {
        console.log(`No YouTube results for: ${searchQuery}`);
        return [];
      }

      // Cache the result
      videoCache.set(cacheKey, { videoId, timestamp: Date.now() });
      console.log(`Found and cached YouTube video: ${videoId} for: ${searchQuery}`);
      
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
   * Rate-limited YouTube search using a queue
   */
  private async searchYouTubeWithRateLimit(query: string): Promise<string | null> {
    return new Promise((resolve) => {
      requestQueue.push({ query, resolve });
      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (isProcessingQueue || requestQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (requestQueue.length > 0) {
      const request = requestQueue.shift();
      if (!request) continue;

      // Wait for rate limit
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
      }
      
      lastRequestTime = Date.now();
      
      try {
        const videoId = await this.searchYouTube(request.query);
        request.resolve(videoId);
      } catch (error) {
        console.error('Queue processing error:', error);
        request.resolve(null);
      }
    }
    
    isProcessingQueue = false;
  }

  /**
   * Search YouTube using the search page
   */
  private async searchYouTube(query: string): Promise<string | null> {
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000, // 10 second timeout
      });

      const html = response.data as string;
      
      // Check for rate limit message
      if (html.includes('Too many requests') || html.includes('unusual traffic')) {
        console.warn('YouTube rate limit detected, waiting...');
        await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
        return null;
      }
      
      // Extract video ID from the search results page
      // YouTube embeds video IDs in the page as "videoId":"XXXXXXXXXXX"
      const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      
      if (videoIdMatch && videoIdMatch[1]) {
        return videoIdMatch[1];
      }

      // Fallback: try to find watch?v= pattern
      const watchMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (watchMatch && watchMatch[1]) {
        return watchMatch[1];
      }

      return null;
    } catch (error) {
      console.error('YouTube scrape error:', error);
      return null;
    }
  }

  /**
   * Get audio stream info from YouTube video
   */
  async getStreamInfo(youtubeId: string): Promise<{ url: string; type: string } | null> {
    // Return the YouTube video URL for IFrame playback
    return {
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      type: 'youtube',
    };
  }

  /**
   * Get direct audio stream URL for downloading/caching
   * Uses ytdl-core to extract the audio stream
   */
  async getDirectAudioUrl(youtubeId: string): Promise<{ url: string; format: string; quality: string; durationMs: number } | null> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      
      console.log('Getting direct audio URL for:', youtubeId);
      
      // Get video info using ytdl-core
      const info = await ytdl.getInfo(videoUrl);
      
      if (!info) {
        console.error('Could not get video info for:', youtubeId);
        return null;
      }

      const durationMs = parseInt(info.videoDetails.lengthSeconds) * 1000;
      
      // Get audio-only formats
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      console.log('Audio formats found:', audioFormats.length);
      
      if (audioFormats.length > 0) {
        // Sort by audio bitrate (highest first)
        audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        
        const bestAudio = audioFormats[0];
        
        if (bestAudio.url) {
          console.log('Found audio URL with bitrate:', bestAudio.audioBitrate);
          return {
            url: bestAudio.url,
            format: bestAudio.container || 'webm',
            quality: (bestAudio.audioBitrate || 0) > 128 ? 'high' : 'medium',
            durationMs,
          };
        }
      }

      // Fallback: try to get any format with audio
      const formatsWithAudio = info.formats.filter(f => f.hasAudio && f.url);
      if (formatsWithAudio.length > 0) {
        // Prefer formats without video to reduce file size
        formatsWithAudio.sort((a, b) => {
          if (a.hasVideo !== b.hasVideo) return a.hasVideo ? 1 : -1;
          return (b.audioBitrate || 0) - (a.audioBitrate || 0);
        });
        
        const best = formatsWithAudio[0];
        console.log('Using fallback format:', best.container, 'hasVideo:', best.hasVideo);
        return {
          url: best.url,
          format: best.container || 'mp4',
          quality: 'medium',
          durationMs,
        };
      }

      console.error('No suitable audio format found for:', youtubeId);
      return null;
    } catch (error) {
      console.error('Failed to get direct audio URL:', youtubeId);
      console.error('Error details:', error instanceof Error ? error.message : error);
      return null;
    }
  }
}

export const audioResolverService = new AudioResolverService();