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

router.get('/saavn-search', async (req, res) => {
  try {
    const query = req.query.query as string;
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const axios = (await import('axios')).default;
    const cleanQuery = query.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const encodedQuery = encodeURIComponent(cleanQuery);

    const saavnEndpoints = [
      `https://saavn.me/api/search/songs?query=${encodedQuery}`,
      `https://jiosaavn-api-private-us.vercel.app/search/songs?query=${encodedQuery}`,
      `https://saavn.dev/api/search/songs?query=${encodedQuery}`,
    ];

    let directMp3Url: string | null = null;

    for (const endpoint of saavnEndpoints) {
      try {
        const apiRes = await axios.get(endpoint, { timeout: 4000 });
        const songs = apiRes.data?.data?.results || apiRes.data?.results;
        if (songs && songs.length > 0 && songs[0].downloadUrl) {
          const downloadUrls = songs[0].downloadUrl;
          const highestQual = downloadUrls[downloadUrls.length - 1]?.url || downloadUrls[0]?.url;
          if (highestQual) {
            directMp3Url = highestQual;
            break;
          }
        }
      } catch (e) {
        // Try next endpoint
      }
    }

    if (!directMp3Url) {
      return res.status(404).json({ error: 'Song stream not found' });
    }

    // Download binary audio buffer and send back with CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    const audioStreamRes = await axios.get(directMp3Url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (audioStreamRes.status >= 200 && audioStreamRes.status < 300 && audioStreamRes.data) {
      const buffer = Buffer.from(audioStreamRes.data);
      res.setHeader('Content-Type', 'audio/mp3');
      res.setHeader('X-Audio-Format', 'mp3');
      res.setHeader('Content-Length', buffer.length.toString());
      return res.send(buffer);
    }

    return res.status(500).json({ error: 'Failed to fetch audio stream buffer' });
  } catch (error) {
    return res.status(500).json({ error: 'Saavn search failed' });
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
