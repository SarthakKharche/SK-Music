import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { audioResolverService } from '../services/audio-resolver.service';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
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

    console.log(`[DOWNLOAD] Attempting audio download stream for: ${youtubeId}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    const { spawn } = await import('child_process');
    const axios = (await import('axios')).default;

    // 1. Try yt-dlp via local path, system command, or python3 module
    const ytCommands = [
      { cmd: '/home/ubuntu/.local/bin/yt-dlp', args: ['-f', 'ba/b[ext=m4a]/b', '--no-playlist', '--no-warnings', '-o', '-', `https://www.youtube.com/watch?v=${youtubeId}`] },
      { cmd: 'yt-dlp', args: ['-f', 'ba/b[ext=m4a]/b', '--no-playlist', '--no-warnings', '-o', '-', `https://www.youtube.com/watch?v=${youtubeId}`] },
      { cmd: 'python3', args: ['-m', 'yt_dlp', '-f', 'ba/b[ext=m4a]/b', '--no-playlist', '--no-warnings', '-o', '-', `https://www.youtube.com/watch?v=${youtubeId}`] },
    ];

    for (const item of ytCommands) {
      try {
        const ytdlp = spawn(item.cmd, item.args);
        let headersSent = false;

        ytdlp.stdout.on('data', (chunk) => {
          if (!headersSent) {
            headersSent = true;
            res.setHeader('Content-Type', 'audio/mp4');
            res.setHeader('X-Audio-Format', 'mp4');
          }
          res.write(chunk);
        });

        ytdlp.stdout.on('end', () => {
          if (headersSent) {
            res.end();
          }
        });

        ytdlp.on('error', (err) => {
          console.warn(`[DOWNLOAD] Command ${item.cmd} error:`, err.message);
        });

        // Give process 2 seconds to start producing stdout chunks
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (headersSent) {
          return;
        }
        ytdlp.kill();
      } catch (e) {
        console.warn(`[DOWNLOAD] Spawn failed for ${item.cmd}:`, e);
      }
    }

    // 2. Fallback to Cobalt v10 endpoint API
    try {
      const cobaltRes = await axios.post(
        'https://api.cobalt.tools/',
        { url: `https://www.youtube.com/watch?v=${youtubeId}` },
        { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 6000 }
      );
      if (cobaltRes.data?.url) {
        const streamRes = await axios.get(cobaltRes.data.url, { responseType: 'stream', timeout: 12000 });
        if (streamRes.status >= 200 && streamRes.status < 300) {
          res.setHeader('Content-Type', 'audio/mp3');
          res.setHeader('X-Audio-Format', 'mp3');
          streamRes.data.pipe(res);
          return;
        }
      }
    } catch (e) {
      console.warn('[DOWNLOAD] Cobalt fallback failed:', e);
    }

    return res.status(500).json({ error: 'Audio download failed' });
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
