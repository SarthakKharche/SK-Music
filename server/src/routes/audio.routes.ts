import { Router, Request, Response } from 'express';
import axios from 'axios';
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

router.get('/saavn-search', async (req: Request, res: Response) => {
  try {
    const rawQuery = (req.query.query as string) || '';
    const trackId = (req.query.trackId as string) || rawQuery;
    let youtubeId = trackId.startsWith('yt-') ? trackId.replace('yt-', '') : '';

    console.log(`[AUDIO DOWNLOAD] Request - trackId: ${trackId}, youtubeId: ${youtubeId}, query: ${rawQuery}`);

    // If youtubeId is not 11 chars, resolve via audioResolverService
    if (!youtubeId || youtubeId.length !== 11) {
      const searchRes = await audioResolverService.resolveAudioSources({
        trackName: rawQuery,
        artistName: '',
      });
      if (searchRes && searchRes[0]?.youtubeId) {
        youtubeId = searchRes[0].youtubeId;
      }
    }

    if (!youtubeId || youtubeId.length !== 11) {
      return res.status(404).json({ error: 'Could not find YouTube track for download' });
    }

    // Use fast Cobalt / Invidious / ytdl-core direct audio URL extraction
    const directAudio = await audioResolverService.getDirectAudioUrl(youtubeId);
    let directUrl: string | null = directAudio?.url || null;

    // Fallback: yt-dlp on EC2 if directUrl is missing
    if (!directUrl) {
      try {
        const { exec } = await import('child_process');
        const util = await import('util');
        const execPromise = util.promisify(exec);
        const { stdout } = await execPromise(
          `yt-dlp -f bestaudio --no-check-certificates --extractor-args "youtube:player_client=android,web" -g "https://www.youtube.com/watch?v=${youtubeId}"`,
          { timeout: 15000 }
        );
        if (stdout && stdout.trim().startsWith('http')) {
          directUrl = stdout.trim().split('\n')[0];
        }
      } catch (e) {
        console.warn('[AUDIO DOWNLOAD] yt-dlp fallback error:', e);
      }
    }

    if (!directUrl) {
      return res.status(404).json({ error: 'Failed to extract direct audio stream' });
    }

    console.log(`[AUDIO DOWNLOAD] Streaming binary audio for ${youtubeId}...`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'audio/mpeg');

    try {
      const audioStreamRes = await axios.get(directUrl, {
        responseType: 'stream',
        timeout: 25000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      });

      if (audioStreamRes.status >= 200 && audioStreamRes.status < 300) {
        if (audioStreamRes.headers['content-length']) {
          res.setHeader('Content-Length', audioStreamRes.headers['content-length']);
        }
        return audioStreamRes.data.pipe(res);
      }
    } catch (streamErr) {
      console.warn('[AUDIO DOWNLOAD] Stream proxy failed, redirecting to direct CDN URL:', streamErr);
    }

    return res.redirect(directUrl);
  } catch (error) {
    console.error('YouTube audio download error:', error);
    return res.status(500).json({ error: 'YouTube audio download failed' });
  }
});

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
 * GET /api/audio/stream/:trackId
 * Stream audio for a track directly
 */
router.get('/stream/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    let youtubeId = trackId;
    
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
    
    const axios = (await import('axios')).default;

    const streamMirrors = [
      `https://invidious.nerdvpn.de/latest_version?id=${youtubeId}&itag=140`,
      `https://yewtu.be/latest_version?id=${youtubeId}&itag=140`,
      `https://vid.puffyan.us/latest_version?id=${youtubeId}&itag=140`,
    ];

    for (const cdnUrl of streamMirrors) {
      try {
        console.log(`[DOWNLOAD] Attempting stream fetch from: ${cdnUrl}`);
        const streamRes = await axios.get(cdnUrl, {
          responseType: 'stream',
          timeout: 10000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (streamRes.status >= 200 && streamRes.status < 300) {
          res.setHeader('Content-Type', 'audio/mp4');
          res.setHeader('X-Audio-Format', 'mp4');
          if (streamRes.headers['content-length']) {
            res.setHeader('Content-Length', streamRes.headers['content-length']);
          }
          streamRes.data.pipe(res);
          return;
        }
      } catch (err) {
        console.warn(`[DOWNLOAD] Mirror failed: ${cdnUrl}`);
      }
    }

    return res.status(500).json({ error: 'Audio stream download failed' });
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
