/**
 * Made For You — API Routes
 *
 * All endpoints require authentication via `isAuthenticated` middleware.
 * Spotify-connected check (`hasSpotifyConnected`) is only required for
 * the initial import; all other operations work independently.
 *
 * Route summary:
 *  POST /api/made-for-you/import           – Import seed playlists from Spotify
 *  GET  /api/made-for-you/playlists        – List all personalised playlists
 *  GET  /api/made-for-you/playlists/:id    – Get a single playlist with tracks
 *  POST /api/made-for-you/regenerate       – Force-regenerate all playlists
 *  POST /api/made-for-you/events           – Record a listening event
 *  POST /api/made-for-you/events/batch     – Batch-record events (offline sync)
 *  GET  /api/made-for-you/stats            – Get listening analytics
 *  DELETE /api/made-for-you/data           – Delete all Made-For-You data
 */

import { Router } from 'express';
import { isAuthenticated, hasSpotifyConnected } from '../middleware/auth.middleware';
import { madeForYouService } from '../services/madeForYou.service';
import type { User } from '../types/user.types';
import type {
  ImportMadeForYouRequest,
  RecordListeningEventRequest,
} from '../types/madeForYou.types';

const router = Router();

// ─── Import from Spotify ─────────────────────────────────────────────────────

/**
 * POST /api/made-for-you/import
 *
 * Fetches Discover Weekly, Daily Mixes, and Release Radar from Spotify,
 * snapshots their tracks, and stores local copies. Spotify is never modified.
 *
 * Body: { skipIfExists?: boolean }
 */
router.post('/import', isAuthenticated, hasSpotifyConnected, async (req, res) => {
  try {
    const user = req.user as User;
    const body = req.body as ImportMadeForYouRequest;
    const result = await madeForYouService.importFromSpotify(
      user.uid,
      body.skipIfExists ?? true,
    );
    res.json(result);
  } catch (error) {
    console.error('[MadeForYou] Import error:', error);
    res.status(500).json({ error: 'Failed to import playlists from Spotify' });
  }
});

// ─── Playlist CRUD ───────────────────────────────────────────────────────────

/**
 * GET /api/made-for-you/playlists
 *
 * Returns all personalised playlists for the authenticated user.
 * Automatically triggers regeneration of any expired playlists.
 */
router.get('/playlists', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;

    // Attempt to regenerate expired playlists silently
    try {
      await madeForYouService.regenerateExpired(user.uid);
    } catch (regenError) {
      console.warn('[MadeForYou] Background regeneration failed:', regenError);
      // Non-fatal — still return existing playlists
    }

    const playlists = await madeForYouService.getUserPlaylists(user.uid);
    res.json({ playlists });
  } catch (error) {
    console.error('[MadeForYou] Fetch playlists error:', error);
    res.status(500).json({ error: 'Failed to fetch personalised playlists' });
  }
});

/**
 * GET /api/made-for-you/playlists/:playlistId
 *
 * Returns a single playlist with its full track list.
 */
router.get('/playlists/:playlistId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { playlistId } = req.params;

    const playlist = await madeForYouService.getPlaylistById(user.uid, playlistId);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    return res.json({ playlist });
  } catch (error) {
    console.error('[MadeForYou] Fetch playlist error:', error);
    return res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// ─── Regeneration ────────────────────────────────────────────────────────────

/**
 * POST /api/made-for-you/regenerate
 *
 * Force-regenerate all personalised playlists using current listening data.
 * Ignores expiry timestamps — useful for "refresh now" UX.
 */
router.post('/regenerate', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const result = await madeForYouService.forceRegenerate(user.uid);
    res.json(result);
  } catch (error) {
    console.error('[MadeForYou] Regeneration error:', error);
    res.status(500).json({ error: 'Failed to regenerate playlists' });
  }
});

// ─── Listening Events ────────────────────────────────────────────────────────

/**
 * POST /api/made-for-you/events
 *
 * Record a single listening event (play / skip / complete).
 *
 * Body: {
 *   trackId: string,
 *   eventType: 'play' | 'skip' | 'complete',
 *   completionPercentage: number,
 *   trackName: string,
 *   artistNames: string[],
 *   genre?: string
 * }
 */
router.post('/events', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const body = req.body as RecordListeningEventRequest;

    // Validate required fields
    if (!body.trackId || !body.eventType || !body.trackName || !body.artistNames) {
      return res.status(400).json({
        error: 'Missing required fields: trackId, eventType, trackName, artistNames',
      });
    }

    if (!['play', 'skip', 'complete'].includes(body.eventType)) {
      return res.status(400).json({
        error: 'eventType must be one of: play, skip, complete',
      });
    }

    await madeForYouService.recordListeningEvent(user.uid, body);
    return res.json({ success: true });
  } catch (error) {
    console.error('[MadeForYou] Record event error:', error);
    return res.status(500).json({ error: 'Failed to record listening event' });
  }
});

/**
 * POST /api/made-for-you/events/batch
 *
 * Batch-record multiple listening events at once.
 * Designed for offline clients syncing queued events.
 *
 * Body: { events: RecordListeningEventRequest[] }
 */
router.post('/events/batch', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }

    if (events.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 events per batch' });
    }

    await madeForYouService.recordListeningEventsBatch(user.uid, events);
    return res.json({ success: true, recorded: events.length });
  } catch (error) {
    console.error('[MadeForYou] Batch event error:', error);
    return res.status(500).json({ error: 'Failed to record listening events' });
  }
});

// ─── Analytics ───────────────────────────────────────────────────────────────

/**
 * GET /api/made-for-you/stats
 *
 * Returns aggregated listening statistics for the authenticated user.
 */
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const stats = await madeForYouService.getListeningStats(user.uid);
    res.json(stats);
  } catch (error) {
    console.error('[MadeForYou] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch listening stats' });
  }
});

// ─── Data Management ─────────────────────────────────────────────────────────

/**
 * DELETE /api/made-for-you/data
 *
 * Remove all Made-For-You playlists and listening events for the user.
 */
router.delete('/data', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    await madeForYouService.deleteUserData(user.uid);
    res.json({ message: 'All Made For You data deleted successfully' });
  } catch (error) {
    console.error('[MadeForYou] Delete data error:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

export default router;
