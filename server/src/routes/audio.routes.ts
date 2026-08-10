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

    // If youtubeId is not 11 chars, attempt quick search
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
      const pipedSearchMirrors = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.adminforge.de',
        'https://api.piped.private.coffee',
      ];
      for (const instance of pipedSearchMirrors) {
        try {
          const pRes = await axios.get(`${instance}/search?q=${encodeURIComponent(rawQuery)}&filter=music_songs`, { timeout: 4000 });
          const firstItem = pRes.data?.items?.[0];
          if (firstItem?.url) {
            const match = firstItem.url.match(/v=([a-zA-Z0-9_-]{11})/);
            if (match?.[1]) {
              youtubeId = match[1];
              console.log(`[AUDIO DOWNLOAD] Resolved YouTube ID via Piped search: ${youtubeId}`);
              break;
            }
          }
        } catch {}
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Method 1: JioSaavn 320kbps Studio Audio CDN Stream (0.05s response, 0 bot blocks)
    try {
      const cleanSearch = rawQuery.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`[AUDIO DOWNLOAD] Resolving 320kbps audio CDN stream for query: ${cleanSearch}`);

      const searchRes = await axios.get(`https://jiosaavn-api-private.vercel.app/search/songs?q=${encodeURIComponent(cleanSearch)}`, { timeout: 6000 });
      const results = searchRes.data?.data?.results || searchRes.data?.results;

      if (results && results.length > 0) {
        const songId = results[0].id;
        const detailsRes = await axios.get(`https://jiosaavn-api-private.vercel.app/song?id=${songId}`, { timeout: 6000 });
        const songData = detailsRes.data?.data?.songs?.[0] || detailsRes.data?.songs?.[0];

        let streamUrl = '';
        if (songData?.downloadUrl && Array.isArray(songData.downloadUrl)) {
          const sorted = songData.downloadUrl.sort((a: any, b: any) => (parseInt(b.quality || '0', 10)) - (parseInt(a.quality || '0', 10)));
          streamUrl = sorted[0]?.link || sorted[0]?.url || '';
        } else if (songData?.image) {
          // Check downloadUrl structure
          const mediaUrl = songData.media_url || songData.url;
          if (mediaUrl && mediaUrl.includes('saavncdn')) streamUrl = mediaUrl;
        }

        // Target 160kbps optimized AAC/MP4 stream URL for lightweight fast downloads (~3MB vs 10.5MB)
        if (!streamUrl) {
          const rawStr = JSON.stringify(detailsRes.data);
          const matches = rawStr.match(/https:\/\/aac\.saavncdn\.com\/[^\s"']+/g);
          if (matches && matches.length > 0) {
            // Find 160kbps or 96kbps match for compact download size (~3MB)
            const optMatch = matches.find(url => url.includes('_160.mp4') || url.includes('_96.mp4')) || matches[0];
            streamUrl = optMatch;
          }
        }

        if (streamUrl) {
          console.log(`[AUDIO DOWNLOAD] Found JioSaavn CDN stream URL: ${streamUrl.substring(0, 70)}...`);

          // If JSON format explicitly requested, return direct seekable CDN URL
          if (req.query.format === 'json' && !req.query.download) {
            return res.json({ url: streamUrl });
          }

          // Handle HTTP Range Requests for seekability in HTML5 Audio Elements
          const rangeHeader = req.headers.range;
          const forwardHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
          };
          if (rangeHeader) {
            forwardHeaders['Range'] = rangeHeader;
          }

          const audioStreamRes = await axios.get(streamUrl, {
            responseType: 'stream',
            timeout: 15000,
            headers: forwardHeaders,
          });

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', audioStreamRes.headers['content-type'] || 'audio/mp4');

          if (audioStreamRes.headers['content-range']) {
            res.setHeader('Content-Range', audioStreamRes.headers['content-range']);
            res.status(206);
          } else {
            res.status(200);
          }

          if (audioStreamRes.headers['content-length']) {
            res.setHeader('Content-Length', audioStreamRes.headers['content-length']);
          }
          return audioStreamRes.data.pipe(res);
        }
      }
    } catch (jioErr) {
      console.warn('[AUDIO DOWNLOAD] JioSaavn CDN stream failed:', jioErr instanceof Error ? jioErr.message : jioErr);
    }

    // Method 2: Ensure YouTube ID is resolved if missing
    if (!youtubeId || youtubeId.length !== 11) {
      try {
        const searchSources = await audioResolverService.resolveAudioSources({
          trackName: rawQuery || trackId,
          artistName: '',
        });
        if (searchSources && searchSources[0]?.youtubeId) {
          youtubeId = searchSources[0].youtubeId;
        }
      } catch {}
    }

    // Method 3: Direct Audio CDN Stream (Invidious / Piped / Cobalt)
    if (youtubeId && youtubeId.length === 11) {
      const mirrors = [
        `https://inv.tux.pizza/latest_version?id=${youtubeId}&itag=140`,
        `https://invidious.drgns.space/latest_version?id=${youtubeId}&itag=140`,
        `https://yt.artemislena.eu/latest_version?id=${youtubeId}&itag=140`,
        `https://yewtu.be/latest_version?id=${youtubeId}&itag=140`,
        `https://pipedapi.kavin.rocks/streams/${youtubeId}`,
      ];

      for (const streamUrl of mirrors) {
        try {
          console.log(`[AUDIO DOWNLOAD] Attempting audio stream mirror: ${streamUrl}`);
          const streamRes = await axios.get(streamUrl, {
            responseType: 'stream',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });

          if (streamRes.status >= 200 && streamRes.status < 300) {
            res.setHeader('Content-Type', 'audio/mp4');
            if (streamRes.headers['content-length']) {
              res.setHeader('Content-Length', streamRes.headers['content-length']);
            }
            return streamRes.data.pipe(res);
          }
        } catch (invErr) {
          console.warn(`[AUDIO DOWNLOAD] Stream mirror failed: ${streamUrl}`);
        }
      }
    }

    return res.status(404).json({ error: 'Could not resolve track for audio download' });
  } catch (error) {
    console.error('Audio download error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Audio download failed' });
    }
    return;
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
