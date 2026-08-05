/**
 * Made For You — Service Layer
 *
 * Orchestrates the full lifecycle of personalised playlists:
 *  1. Import seed playlists from Spotify (read-only, one-time snapshot).
 *  2. Record in-app listening events to Firestore.
 *  3. Periodically regenerate playlists via the recommendation engine.
 *  4. CRUD operations for the frontend to consume.
 *
 * Design principles:
 *  - Never writes to Spotify. All mutations are local.
 *  - Audio blobs are never stored in the backend.
 *  - Playlists are fully decoupled from Spotify after the initial seed.
 */

import { getFirestore } from '../config/firebase';
import { SpotifyService } from './spotify.service';
import {
  aggregateEvents,
  computeScores,
  buildArtistAffinity,
  generateDiscoverWeekly,
  generateDailyMix,
} from './recommendation.engine';
import type {
  MadeForYouPlaylist,
  MadeForYouPlaylistType,
  ListeningEvent,
  MadeForYouTrackEntry,
  RecommendationReason,
  ImportMadeForYouResponse,
  RecordListeningEventRequest,
  RegenerateResponse,
} from '../types/madeForYou.types';
import type { Track } from '../types/user.types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Firestore collection names */
const COL_PLAYLISTS = 'madeForYouPlaylists';
const COL_EVENTS = 'listeningEvents';

/** Spotify playlist name patterns we look for during import */
const DISCOVER_WEEKLY_PATTERNS = ['discover weekly'];
const DAILY_MIX_PATTERNS = ['daily mix'];
const RELEASE_RADAR_PATTERNS = ['release radar'];

/** Regeneration intervals in milliseconds */
const DISCOVER_WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DAILY_MIX_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Service Class ───────────────────────────────────────────────────────────

export class MadeForYouService {
  private spotifyService: SpotifyService;

  constructor() {
    this.spotifyService = new SpotifyService();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. IMPORT FROM SPOTIFY (One-time seed, read-only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch the user's "Made For You" playlists from Spotify, snapshot their
   * tracks, and persist local copies.  Spotify is never modified.
   *
   * Idempotent: if `skipIfExists` is true and playlists already exist,
   * the import is skipped.
   */
  async importFromSpotify(
    userId: string,
    skipIfExists = true,
  ): Promise<ImportMadeForYouResponse> {
    const db = getFirestore();

    // Check for existing playlists
    if (skipIfExists) {
      const existing = await db
        .collection(COL_PLAYLISTS)
        .where('userId', '==', userId)
        .where('source', '==', 'spotify_seed')
        .limit(1)
        .get();

      if (!existing.empty) {
        const all = await this.getUserPlaylists(userId);
        return {
          imported: 0,
          playlists: all.map((p) => ({
            id: p.id,
            type: p.type,
            displayName: p.displayName,
            trackCount: p.tracks.length,
          })),
        };
      }
    } else {
      // Force re-import: we'll delete old playlists only AFTER we successfully create new ones
      // (handled below)
    }

    // Fetch user's Spotify playlists
    const spotifyPlaylists = await this.spotifyService.getUserPlaylists(userId);
    const imported: MadeForYouPlaylist[] = [];
    const now = new Date().toISOString();

    for (const sp of spotifyPlaylists) {
      const nameLower = sp.name.toLowerCase();

      let type: MadeForYouPlaylistType | null = null;
      let displayName = '';
      let subtitle = '';
      let mixNumber: number | undefined;

      if (DISCOVER_WEEKLY_PATTERNS.some((p) => nameLower.includes(p))) {
        type = 'discover_weekly';
        displayName = 'Discover Weekly — For You';
        subtitle = 'Initially inspired by Spotify, now personalized by your listening here';
      } else if (DAILY_MIX_PATTERNS.some((p) => nameLower.includes(p))) {
        type = 'daily_mix';
        // Extract mix number (e.g. "Daily Mix 2" → 2)
        const numMatch = sp.name.match(/\d+/);
        mixNumber = numMatch ? parseInt(numMatch[0], 10) : 1;
        displayName = `Daily Mix ${mixNumber} — Personalized`;
        subtitle = 'Initially inspired by Spotify, now personalized by your listening here';
      } else if (RELEASE_RADAR_PATTERNS.some((p) => nameLower.includes(p))) {
        // Treat Release Radar as a special Discover Weekly variant
        type = 'discover_weekly';
        displayName = 'Release Radar — For You';
        subtitle = 'Initially inspired by Spotify, now personalized by your listening here';
      } else {
        // Not a "Made For You" playlist — skip
        continue;
      }

      // Snapshot tracks from Spotify (read-only)
      let spotifyTracks: Array<{
        id: string;
        name: string;
        artists: Array<{ id: string; name: string }>;
        album: {
          id: string;
          name: string;
          images: Array<{ url: string }>;
          release_date: string;
        };
        duration_ms: number;
        explicit: boolean;
        external_ids: { isrc?: string };
        external_urls: { spotify: string };
        preview_url: string | null;
      }> = [];

      try {
        spotifyTracks = await this.spotifyService.getPlaylistTracks(userId, sp.id);
      } catch (err) {
        console.warn(`[MadeForYou] Failed to fetch tracks for ${sp.name}:`, err);
        continue;
      }

      // Skip playlists that came back empty from Spotify
      if (spotifyTracks.length === 0) {
        console.warn(`[MadeForYou] Skipping ${sp.name} — 0 tracks returned from Spotify`);
        continue;
      }

      const trackEntries: MadeForYouTrackEntry[] = spotifyTracks.map((t, i) => ({
        trackId: t.id,
        position: i,
        score: 1, // seed tracks start with max score
        reason: 'seed_track' as const,
        name: t.name,
        artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
        album: {
          id: t.album.id,
          name: t.album.name,
          imageUrl: t.album.images?.[0]?.url,
          releaseDate: t.album.release_date,
        },
        durationMs: t.duration_ms,
        explicit: t.explicit,
        isrc: t.external_ids?.isrc,
        spotifyUrl: t.external_urls.spotify,
        previewUrl: t.preview_url ?? undefined,
      }));

      const expiresAt =
        type === 'discover_weekly'
          ? new Date(Date.now() + DISCOVER_WEEKLY_INTERVAL_MS).toISOString()
          : new Date(Date.now() + DAILY_MIX_INTERVAL_MS).toISOString();

      const playlistDoc: MadeForYouPlaylist = {
        id: '', // will be set after Firestore generates the ID
        userId,
        type,
        mixNumber,
        displayName,
        subtitle,
        source: 'spotify_seed',
        spotifyPlaylistId: sp.id,
        tracks: trackEntries,
        imageUrl: sp.images?.[0]?.url,
        generatedAt: now,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      };

      // Persist to Firestore
      const docRef = await db.collection(COL_PLAYLISTS).add(playlistDoc);
      playlistDoc.id = docRef.id;
      await docRef.update({ id: docRef.id });

      imported.push(playlistDoc);
    }

    // If no Spotify MFY playlists found, seed from user's top/recent/saved tracks
    if (imported.length === 0) {
      const seeded = await this.createSeededPlaylists(userId);
      imported.push(...seeded);
    }

    // Only delete old playlists now that we confirmed we have new ones to replace them with
    // (if skipIfExists is false, meaning force re-import was requested)
    if (!skipIfExists && imported.length > 0) {
      const existing = await db
        .collection(COL_PLAYLISTS)
        .where('userId', '==', userId)
        .get();
      // Only delete docs that aren't the ones we just created
      const newIds = new Set(imported.map((p) => p.id));
      const batch = db.batch();
      existing.docs
        .filter((doc) => !newIds.has(doc.id))
        .forEach((doc) => batch.delete(doc.ref));
      if (!existing.empty) await batch.commit();
    }

    return {
      imported: imported.length,
      playlists: imported.map((p) => ({
        id: p.id,
        type: p.type,
        displayName: p.displayName,
        trackCount: p.tracks.length,
      })),
    };
  }

  /**
   * Create seed playlists using the user's Spotify listening data
   * (top tracks, recently played, saved tracks) when no "Made For You"
   * playlists are found in their library.
   */
  private async createSeededPlaylists(userId: string): Promise<MadeForYouPlaylist[]> {
    const db = getFirestore();
    const now = new Date().toISOString();
    const results: MadeForYouPlaylist[] = [];

    // Fetch user's listening data from Spotify in parallel
    let topShort: any[] = [];
    let topMedium: any[] = [];
    let recentlyPlayed: any[] = [];
    let savedTracks: any[] = [];

    try {
      [topShort, topMedium, recentlyPlayed, savedTracks] = await Promise.all([
        this.spotifyService.getTopTracks(userId, 'short_term', 50).catch((e) => {
          console.warn('[MadeForYou] getTopTracks(short_term) failed:', e?.response?.status, e?.message);
          return [];
        }),
        this.spotifyService.getTopTracks(userId, 'medium_term', 50).catch((e) => {
          console.warn('[MadeForYou] getTopTracks(medium_term) failed:', e?.response?.status, e?.message);
          return [];
        }),
        this.spotifyService.getRecentlyPlayed(userId, 50).catch((e) => {
          console.warn('[MadeForYou] getRecentlyPlayed failed:', e?.response?.status, e?.message);
          return [];
        }),
        this.spotifyService.getSavedTracks(userId, 50).catch((e) => {
          console.warn('[MadeForYou] getSavedTracks failed:', e?.response?.status, e?.message);
          return [];
        }),
      ]);
    } catch (err) {
      console.warn('[MadeForYou] Failed to fetch user listening data:', err);
    }

    console.log(`[MadeForYou] Seed data — topShort: ${topShort.length}, topMedium: ${topMedium.length}, recent: ${recentlyPlayed.length}, saved: ${savedTracks.length}`);

    // De-duplicate tracks by ID
    const dedup = (tracks: any[]) => {
      const seen = new Set<string>();
      return tracks.filter((t) => {
        if (!t || !t.id || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
    };

    // Convert Spotify tracks to MadeForYouTrackEntry format
    const toEntries = (tracks: any[], reason: RecommendationReason): MadeForYouTrackEntry[] =>
      tracks.map((t, i) => ({
        trackId: t.id,
        position: i,
        score: 1 - i * 0.01, // slightly decreasing score by position
        reason,
        name: t.name,
        artists: (t.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
        album: {
          id: t.album?.id || '',
          name: t.album?.name || '',
          imageUrl: t.album?.images?.[0]?.url,
          releaseDate: t.album?.release_date,
        },
        durationMs: t.duration_ms || 0,
        explicit: t.explicit || false,
        isrc: t.external_ids?.isrc,
        spotifyUrl: t.external_urls?.spotify || '',
        previewUrl: t.preview_url ?? undefined,
      }));

    // Pick the best cover image from a list of tracks
    const pickCover = (tracks: MadeForYouTrackEntry[]): string | undefined =>
      tracks.find((t) => t.album.imageUrl)?.album.imageUrl;

    // ── Discover Weekly: blend of medium-term top + recently played (variety) ──
    const dwPool = dedup([...topMedium, ...recentlyPlayed, ...savedTracks]);
    // Shuffle for variety
    for (let i = dwPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dwPool[i], dwPool[j]] = [dwPool[j], dwPool[i]];
    }
    const dwTracks = toEntries(dwPool.slice(0, 30), 'frequently_played');
    // Re-number positions
    dwTracks.forEach((t, i) => { t.position = i; });

    if (dwTracks.length > 0) {
      const doc: MadeForYouPlaylist = {
        id: '',
        userId,
        type: 'discover_weekly',
        displayName: 'Discover Weekly',
        subtitle: 'Your weekly mixtape of fresh music based on your listening',
        source: 'spotify_seed',
        tracks: dwTracks,
        imageUrl: pickCover(dwTracks),
        generatedAt: now,
        expiresAt: new Date(Date.now() + DISCOVER_WEEKLY_INTERVAL_MS).toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COL_PLAYLISTS).add(doc);
      doc.id = docRef.id;
      await docRef.update({ id: docRef.id });
      results.push(doc);
    }

    // ── Daily Mix 1: short-term favourites (current obsessions) ──
    const dm1Pool = dedup([...topShort, ...topMedium.slice(0, 20)]);
    const dm1Tracks = toEntries(dm1Pool.slice(0, 25), 'frequently_played');
    dm1Tracks.forEach((t, i) => { t.position = i; });

    if (dm1Tracks.length > 0) {
      const doc: MadeForYouPlaylist = {
        id: '',
        userId,
        type: 'daily_mix',
        mixNumber: 1,
        displayName: 'Daily Mix 1',
        subtitle: 'Your current favourites and familiar vibes',
        source: 'spotify_seed',
        tracks: dm1Tracks,
        imageUrl: pickCover(dm1Tracks),
        generatedAt: now,
        expiresAt: new Date(Date.now() + DAILY_MIX_INTERVAL_MS).toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COL_PLAYLISTS).add(doc);
      doc.id = docRef.id;
      await docRef.update({ id: docRef.id });
      results.push(doc);
    }

    // ── Daily Mix 2: saved/liked tracks (deeper library) ──
    const dm2Pool = dedup([...savedTracks, ...recentlyPlayed]);
    // Remove tracks already in Daily Mix 1
    const dm1Ids = new Set(dm1Tracks.map((t) => t.trackId));
    const dm2Filtered = dm2Pool.filter((t) => !dm1Ids.has(t.id));
    const dm2Tracks = toEntries(dm2Filtered.slice(0, 25), 'high_completion');
    dm2Tracks.forEach((t, i) => { t.position = i; });

    if (dm2Tracks.length > 0) {
      const doc: MadeForYouPlaylist = {
        id: '',
        userId,
        type: 'daily_mix',
        mixNumber: 2,
        displayName: 'Daily Mix 2',
        subtitle: 'Deeper cuts from your library and recent listens',
        source: 'spotify_seed',
        tracks: dm2Tracks,
        imageUrl: pickCover(dm2Tracks),
        generatedAt: now,
        expiresAt: new Date(Date.now() + DAILY_MIX_INTERVAL_MS).toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COL_PLAYLISTS).add(doc);
      doc.id = docRef.id;
      await docRef.update({ id: docRef.id });
      results.push(doc);
    }

    // If we still couldn't get any tracks at all, return empty — no placeholders.
    // The caller (importFromSpotify) will handle this case gracefully.
    if (results.length === 0) {
      console.warn('[MadeForYou] No tracks available from Spotify — skipping placeholder creation.');
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. LISTENING EVENT TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a single listening event (play, skip, or completion).
   * These events drive the recommendation engine.
   */
  async recordListeningEvent(
    userId: string,
    req: RecordListeningEventRequest,
  ): Promise<void> {
    const db = getFirestore();
    const now = new Date().toISOString();

    const event: Omit<ListeningEvent, 'id'> = {
      userId,
      trackId: req.trackId,
      eventType: req.eventType,
      completionPercentage: Math.max(0, Math.min(100, req.completionPercentage)),
      timestamp: now,
      trackName: req.trackName,
      artistNames: req.artistNames,
      genre: req.genre,
    };

    const docRef = await db.collection(COL_EVENTS).add(event);
    await docRef.update({ id: docRef.id });
  }

  /**
   * Batch-record multiple events (useful for offline sync).
   */
  async recordListeningEventsBatch(
    userId: string,
    events: RecordListeningEventRequest[],
  ): Promise<void> {
    const db = getFirestore();
    const batch = db.batch();
    const now = new Date().toISOString();

    for (const req of events) {
      const docRef = db.collection(COL_EVENTS).doc();
      batch.set(docRef, {
        id: docRef.id,
        userId,
        trackId: req.trackId,
        eventType: req.eventType,
        completionPercentage: Math.max(0, Math.min(100, req.completionPercentage)),
        timestamp: now,
        trackName: req.trackName,
        artistNames: req.artistNames,
        genre: req.genre,
      });
    }

    await batch.commit();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PLAYLIST REGENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Regenerate all expired personalised playlists for a user.
   * Called by a scheduled job or on-demand via API.
   *
   * Flow:
   *  1. Load all user events from Firestore.
   *  2. Load all known tracks for the user.
   *  3. Aggregate → score → generate playlists via recommendation engine.
   *  4. Overwrite playlist tracks in Firestore.
   */
  async regenerateExpired(userId: string): Promise<RegenerateResponse> {
    const db = getFirestore();
    const now = new Date();
    const nowIso = now.toISOString();

    // Find expired playlists
    const snapshot = await db
      .collection(COL_PLAYLISTS)
      .where('userId', '==', userId)
      .get();

    const expiredPlaylists = snapshot.docs
      .map((doc) => doc.data() as MadeForYouPlaylist)
      .filter((p) => new Date(p.expiresAt) <= now);

    if (expiredPlaylists.length === 0) {
      return { regenerated: 0, playlists: [] };
    }

    // Load listening events (last 90 days for relevance)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const eventsSnapshot = await db
      .collection(COL_EVENTS)
      .where('userId', '==', userId)
      .where('timestamp', '>=', ninetyDaysAgo)
      .get();

    const events: ListeningEvent[] = eventsSnapshot.docs.map(
      (doc) => doc.data() as ListeningEvent,
    );

    // Load all tracks the user has in the system
    const tracksSnapshot = await db
      .collection('tracks')
      .where('userId', '==', userId)
      .get();

    const allTracks = new Map<string, Track>();
    for (const doc of tracksSnapshot.docs) {
      const t = doc.data() as Track;
      allTracks.set(t.id, t);
    }

    // Also include tracks from existing MadeForYou playlists
    for (const playlist of snapshot.docs.map((d) => d.data() as MadeForYouPlaylist)) {
      for (const te of playlist.tracks) {
        if (!allTracks.has(te.trackId)) {
          allTracks.set(te.trackId, {
            id: te.trackId,
            playlistId: playlist.id,
            userId,
            name: te.name,
            artists: te.artists,
            album: te.album,
            durationMs: te.durationMs,
            explicit: te.explicit,
            isrc: te.isrc,
            spotifyUrl: te.spotifyUrl,
            previewUrl: te.previewUrl,
            isOfflinePreferred: false,
            addedAt: playlist.createdAt,
          });
        }
      }
    }

    // Aggregate and score
    const aggregated = aggregateEvents(events, allTracks);
    const artistAffinity = buildArtistAffinity(aggregated);
    const ranked = computeScores(aggregated, artistAffinity);

    // Regenerate each expired playlist
    const regenerated: MadeForYouPlaylist[] = [];
    const batch = db.batch();

    for (const playlist of expiredPlaylists) {
      let newTracks: MadeForYouTrackEntry[] = [];

      if (playlist.type === 'discover_weekly') {
        newTracks = generateDiscoverWeekly(ranked, allTracks, artistAffinity);
      } else if (playlist.type === 'daily_mix') {
        newTracks = generateDailyMix(ranked, playlist.mixNumber ?? 1);
      }

      // If engine produced no tracks (not enough data), keep existing tracks
      if (newTracks.length === 0 && playlist.tracks.length > 0) {
        // Just extend the expiry
        const expiresAt =
          playlist.type === 'discover_weekly'
            ? new Date(Date.now() + DISCOVER_WEEKLY_INTERVAL_MS).toISOString()
            : new Date(Date.now() + DAILY_MIX_INTERVAL_MS).toISOString();

        batch.update(db.collection(COL_PLAYLISTS).doc(playlist.id), {
          expiresAt,
          updatedAt: nowIso,
        });

        regenerated.push({ ...playlist, expiresAt, updatedAt: nowIso });
        continue;
      }

      const expiresAt =
        playlist.type === 'discover_weekly'
          ? new Date(Date.now() + DISCOVER_WEEKLY_INTERVAL_MS).toISOString()
          : new Date(Date.now() + DAILY_MIX_INTERVAL_MS).toISOString();

      const updateData = {
        tracks: newTracks,
        source: 'app_generated' as const,
        generatedAt: nowIso,
        expiresAt,
        updatedAt: nowIso,
      };

      batch.update(db.collection(COL_PLAYLISTS).doc(playlist.id), updateData);
      regenerated.push({ ...playlist, ...updateData });
    }

    await batch.commit();

    return {
      regenerated: regenerated.length,
      playlists: regenerated.map((p) => ({
        id: p.id,
        type: p.type,
        displayName: p.displayName,
        trackCount: p.tracks.length,
      })),
    };
  }

  /**
   * Force regeneration of all playlists regardless of expiry.
   */
  async forceRegenerate(userId: string): Promise<RegenerateResponse> {
    const db = getFirestore();

    // Set all playlists to expired, then call regenerateExpired
    const snapshot = await db
      .collection(COL_PLAYLISTS)
      .where('userId', '==', userId)
      .get();

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.update(doc.ref, { expiresAt: new Date(0).toISOString() });
    }
    await batch.commit();

    return this.regenerateExpired(userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all personalised playlists for a user.
   * Triggers regeneration of expired playlists before returning.
   */
  async getUserPlaylists(userId: string): Promise<MadeForYouPlaylist[]> {
    const db = getFirestore();

    const snapshot = await db
      .collection(COL_PLAYLISTS)
      .where('userId', '==', userId)
      .get();

    if (snapshot.empty) {
      console.log(`[MadeForYou] Auto-seeding initial playlists for user: ${userId}`);
      return await this.createSeededPlaylists(userId);
    }

    return snapshot.docs.map((doc) => doc.data() as MadeForYouPlaylist);
  }

  /**
   * Get a specific playlist by ID.
   */
  async getPlaylistById(
    userId: string,
    playlistId: string,
  ): Promise<MadeForYouPlaylist | null> {
    const db = getFirestore();
    const doc = await db.collection(COL_PLAYLISTS).doc(playlistId).get();

    if (!doc.exists) return null;

    const playlist = doc.data() as MadeForYouPlaylist;
    if (playlist.userId !== userId) return null; // authorization check

    return playlist;
  }

  /**
   * Get listening stats summary for the user.
   */
  async getListeningStats(userId: string): Promise<{
    totalEvents: number;
    totalPlays: number;
    totalSkips: number;
    totalCompletes: number;
    topArtists: Array<{ name: string; playCount: number }>;
    avgCompletion: number;
  }> {
    const db = getFirestore();

    const eventsSnapshot = await db
      .collection(COL_EVENTS)
      .where('userId', '==', userId)
      .get();

    const events = eventsSnapshot.docs.map((doc) => doc.data() as ListeningEvent);

    const totalPlays = events.filter((e) => e.eventType === 'play').length;
    const totalSkips = events.filter((e) => e.eventType === 'skip').length;
    const totalCompletes = events.filter((e) => e.eventType === 'complete').length;
    const avgCompletion =
      events.length > 0
        ? events.reduce((sum, e) => sum + e.completionPercentage, 0) / events.length
        : 0;

    // Top artists
    const artistCounts = new Map<string, number>();
    for (const ev of events) {
      if (ev.eventType === 'play' || ev.eventType === 'complete') {
        for (const name of ev.artistNames) {
          artistCounts.set(name, (artistCounts.get(name) ?? 0) + 1);
        }
      }
    }

    const topArtists = Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, playCount]) => ({ name, playCount }));

    return {
      totalEvents: events.length,
      totalPlays,
      totalSkips,
      totalCompletes,
      topArtists,
      avgCompletion: Math.round(avgCompletion),
    };
  }

  /**
   * Delete all Made-For-You data for a user (playlists + events).
   */
  async deleteUserData(userId: string): Promise<void> {
    const db = getFirestore();

    // Delete playlists
    const playlistSnapshot = await db
      .collection(COL_PLAYLISTS)
      .where('userId', '==', userId)
      .get();
    const batch1 = db.batch();
    for (const doc of playlistSnapshot.docs) {
      batch1.delete(doc.ref);
    }
    await batch1.commit();

    // Delete events (may need multiple batches for large datasets)
    let eventsSnapshot = await db
      .collection(COL_EVENTS)
      .where('userId', '==', userId)
      .limit(500)
      .get();

    while (!eventsSnapshot.empty) {
      const batch = db.batch();
      for (const doc of eventsSnapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      eventsSnapshot = await db
        .collection(COL_EVENTS)
        .where('userId', '==', userId)
        .limit(500)
        .get();
    }
  }
}

export const madeForYouService = new MadeForYouService();
