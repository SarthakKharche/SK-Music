import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { audioResolverService } from '../services/audio-resolver.service';
import ytDlpExec from 'yt-dlp-exec';
import { createReadStream, unlinkSync, existsSync, mkdirSync, statSync } from 'fs';
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
    const { youtubeId } = req.params;
    
    if (!youtubeId) {
      return res.status(400).json({ error: 'YouTube ID is required' });
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
 * Stream audio through server for offline caching using yt-dlp
 */
router.get('/download/:youtubeId', async (req, res) => {
  try {
    const { youtubeId } = req.params;
    
    if (!youtubeId) {
      return res.status(400).json({ error: 'YouTube ID is required' });
    }

    console.log(`[DOWNLOAD] Starting audio download for: ${youtubeId}`);

    const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    // Use webm format - doesn't require ffmpeg
    const outputFile = join(TEMP_DIR, `${youtubeId}.webm`);
    
    // Clean up old file if exists
    if (existsSync(outputFile)) {
      unlinkSync(outputFile);
    }

    // Use yt-dlp-exec with Android player client to avoid 403 Forbidden errors
    await ytDlpExec(videoUrl, {
      format: 'bestaudio/18',
      output: outputFile,
      noPlaylist: true,
      noWarnings: true,
      extractorArgs: 'youtube:player-client=android',
    } as any);

    // Check if file was created
    if (!existsSync(outputFile)) {
      console.error(`[DOWNLOAD] File not created for: ${youtubeId}`);
      return res.status(500).json({ error: 'Download failed - file not created' });
    }

    console.log(`[DOWNLOAD] File ready, streaming: ${youtubeId}`);

    const stats = statSync(outputFile);

    // Set response headers
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('X-Audio-Format', 'webm');
    res.setHeader('X-Audio-Quality', 'high');

    // Stream the file
    const fileStream = createReadStream(outputFile);
    
    fileStream.on('end', () => {
      console.log(`[DOWNLOAD] ✅ Completed download for: ${youtubeId}`);
      // Clean up temp file
      try {
        unlinkSync(outputFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    fileStream.on('error', (error) => {
      console.error(`[DOWNLOAD] Stream error for ${youtubeId}:`, error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
      // Clean up temp file
      try {
        unlinkSync(outputFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    fileStream.pipe(res);
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
