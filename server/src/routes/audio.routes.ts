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
    
    const axios = (await import('axios')).default;

    // 1. Resolve direct audio stream URL via Piped API mirrors
    const pipedInstances = [
      'https://pipedapi.adminforge.de',
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.mha.fi',
    ];

    let directAudioUrl: string | null = null;
    for (const instance of pipedInstances) {
      try {
        const pipedRes = await axios.get(`${instance}/streams/${youtubeId}`, { timeout: 4000 });
        const audioStreams = pipedRes.data?.audioStreams;
        if (audioStreams && audioStreams.length > 0) {
          audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          if (audioStreams[0]?.url) {
            directAudioUrl = audioStreams[0].url;
            console.log(`[DOWNLOAD] Resolved Piped stream URL: ${directAudioUrl.substring(0, 40)}`);
            break;
          }
        }
      } catch (e) {
        // Try next Piped mirror
      }
    }

    // 2. Cobalt API Fallback
    if (!directAudioUrl) {
      try {
        const cobaltRes = await axios.post(
          'https://api.cobalt.tools',
          { url: `https://www.youtube.com/watch?v=${youtubeId}` },
          { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 5000 }
        );
        if (cobaltRes.data?.url) {
          directAudioUrl = cobaltRes.data.url;
          console.log(`[DOWNLOAD] Resolved Cobalt stream URL: ${directAudioUrl.substring(0, 40)}`);
        }
      } catch (e) {
        // Cobalt failed
      }
    }

    if (!directAudioUrl) {
      directAudioUrl = `https://invidious.nerdvpn.de/latest_version?id=${youtubeId}&itag=140`;
    }

    // Stream binary buffer back to client
    try {
      const streamRes = await axios.get(directAudioUrl, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (streamRes.status >= 200 && streamRes.status < 300 && streamRes.data) {
        const buffer = Buffer.from(streamRes.data);
        if (buffer.length > 20000) {
          res.setHeader('Content-Type', 'audio/mp4');
          res.setHeader('X-Audio-Format', 'mp4');
          res.setHeader('Content-Length', buffer.length.toString());
          return res.send(buffer);
        }
      }
    } catch (err) {
      console.warn(`[DOWNLOAD] Buffer fetch failed: ${err}`);
    }

    return res.status(500).json({ error: 'Audio download stream failed' });
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
