import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { audioResolverService } from '../services/audio-resolver.service';
import { createReadStream, unlinkSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import type { AudioResolveRequest } from '../types/audio.types';

// Temp directory for audio downloads
const TEMP_DIR = join(process.cwd(), 'temp_audio');
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

const router = Router();

/**
 * POST /api/audio/resolve
 * Resolve audio source URL for a track
 * CRITICAL: Returns URL to external audio source, NOT Spotify audio
 */
router.post('/resolve', isAuthenticated, async (req, res) => {
  try {
    const request: AudioResolveRequest = req.body;

    if (!request.trackName || !request.artistName) {
      return res.status(400).json({ 
        error: 'trackName and artistName are required' 
      });
    }

    const sources = await audioResolverService.resolveAudioSources(request);

    if (!sources || sources.length === 0) {
      return res.status(404).json({ 
        error: 'No audio sources found for this track' 
      });
    }

    return res.json({ sources });
  } catch (error) {
    console.error('Error resolving audio:', error);
    return res.status(500).json({ error: 'Failed to resolve audio source' });
  }
});

/**
 * POST /api/audio/report-issue
 * Report audio quality or availability issue
 */
router.post('/report-issue', isAuthenticated, async (req, res) => {
  try {
    const { trackId, issueType, description } = req.body;

    // Log issue for monitoring
    console.log('Audio issue reported:', {
      trackId,
      issueType,
      description,
      userId: req.user?.uid,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: 'Issue reported successfully' });
  } catch (error) {
    console.error('Error reporting issue:', error);
    res.status(500).json({ error: 'Failed to report issue' });
  }
});

/**
 * GET /api/audio/youtube/:videoId
 * Get YouTube video info for audio playback
 */
router.get('/youtube/:videoId', isAuthenticated, async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    // Return embed URL for audio playback
    return res.json({
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  } catch (error) {
    console.error('Error getting YouTube info:', error);
    return res.status(500).json({ error: 'Failed to get video info' });
  }
});

/**
 * GET /api/audio/stream/:youtubeId
 * Get direct audio stream URL for a YouTube video
 */
router.get('/stream/:youtubeId', isAuthenticated, async (req, res) => {
  try {
    let { youtubeId } = req.params;
    
    if (!youtubeId) {
      return res.status(400).json({ error: 'YouTube ID is required' });
    }

    if (youtubeId.startsWith('yt-')) {
      youtubeId = youtubeId.substring(3);
    }

    const streamInfo = await audioResolverService.getStreamInfo(youtubeId);
    
    if (!streamInfo) {
      return res.status(404).json({ error: 'Could not get stream for this video' });
    }

    return res.json({
      youtubeId,
      streamUrl: streamInfo.url,
      type: streamInfo.type,
    });
  } catch (error) {
    console.error('Error getting stream:', error);
    return res.status(500).json({ error: 'Failed to get audio stream' });
  }
});

/**
 * GET /api/audio/download/:youtubeId
 * Stream audio through server with HTTP Range seeking support
 */
router.get('/download/:youtubeId', async (req, res) => {
  try {
    let { youtubeId } = req.params;
    
    if (!youtubeId) {
      return res.status(400).json({ error: 'YouTube ID is required' });
    }

    // Strip client-side 'yt-' prefix if present
    if (youtubeId.startsWith('yt-')) {
      youtubeId = youtubeId.substring(3);
    }

    console.log(`[DOWNLOAD] Attempting direct audio stream for: ${youtubeId}`);
    try {
      const directUrlInfo = await audioResolverService.getDirectAudioUrl(youtubeId);
      if (directUrlInfo?.url) {
        console.log(`[DOWNLOAD] Proxying direct CDN stream with Range support for ${youtubeId}`);
        const rangeHeader = req.headers.range;
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        if (rangeHeader) {
          headers['Range'] = rangeHeader;
        }

        const cdnResponse = await axios.get(directUrlInfo.url, {
          headers,
          responseType: 'stream',
          validateStatus: () => true,
        });

        if (cdnResponse.status >= 200 && cdnResponse.status < 300) {
          res.status(cdnResponse.status);
          if (cdnResponse.headers['content-type']) {
            res.setHeader('Content-Type', cdnResponse.headers['content-type']);
          } else {
            res.setHeader('Content-Type', 'audio/webm');
          }
          if (cdnResponse.headers['content-length']) {
            res.setHeader('Content-Length', cdnResponse.headers['content-length']);
          }
          if (cdnResponse.headers['content-range']) {
            res.setHeader('Content-Range', cdnResponse.headers['content-range']);
          }
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('X-Audio-Format', directUrlInfo.format || 'webm');
          res.setHeader('X-Audio-Quality', directUrlInfo.quality || 'high');

          cdnResponse.data.pipe(res);
          return;
        } else {
          console.warn(`[DOWNLOAD] CDN URL returned HTTP ${cdnResponse.status}, clearing stale cache for: ${youtubeId}`);
          audioResolverService.clearStreamCache(youtubeId);
        }
      }
    } catch (directErr) {
      console.warn('[DOWNLOAD] Direct stream extraction failed, falling back to local download:', directErr);
    }

    console.log(`[DOWNLOAD] Starting audio download for: ${youtubeId}`);

    const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const outputFile = join(TEMP_DIR, `${youtubeId}.webm`);
    
    // Clean up old file if exists
    if (existsSync(outputFile)) {
      unlinkSync(outputFile);
    }

    // Execute system yt-dlp binary directly
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFilePromise = promisify(execFile);

    await execFilePromise('/usr/local/bin/yt-dlp', [
      videoUrl,
      '--format', 'bestaudio',
      '--output', outputFile,
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=ios,web_creator',
    ]);

    if (!existsSync(outputFile)) {
      console.error(`[DOWNLOAD] File not created for: ${youtubeId}`);
      return res.status(500).json({ error: 'Download failed - file not created' });
    }

    console.log(`[DOWNLOAD] File ready, streaming: ${youtubeId}`);

    const stats = statSync(outputFile);
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Audio-Format', 'webm');
    res.setHeader('X-Audio-Quality', 'high');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
      res.setHeader('Content-Length', chunksize);
      res.setHeader('Content-Type', 'audio/webm');

      const fileStream = createReadStream(outputFile, { start, end });
      fileStream.pipe(res);
    } else {
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Content-Length', stats.size);
      const fileStream = createReadStream(outputFile);
      fileStream.pipe(res);
    }

    return;
  } catch (error) {
    console.error('[DOWNLOAD] Error:', error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to download audio' });
    }
    res.end();
    return;
  }
});

export default router;
