/**
 * Recommendation Engine
 *
 * Pure-logic module that scores and selects tracks for personalised playlists.
 * No I/O — operates entirely on the aggregated data passed in.
 *
 * Algorithm overview:
 *  1. Score each candidate track using weighted signals.
 *  2. Apply recency decay so stale favourites don't dominate.
 *  3. Penalise frequently-skipped tracks.
 *  4. Boost tracks by artists / genres the user already likes.
 *  5. Sort by final score, deduplicate, and return top-N.
 */

import type {
  ListeningEvent,
  TrackScore,
  MadeForYouTrackEntry,
  RecommendationReason,
} from '../types/madeForYou.types';
import type { Track } from '../types/user.types';

// ─── Tuning Constants ────────────────────────────────────────────────────────

/** Weight applied to raw play-count signal (0-1) */
const W_PLAY_COUNT = 0.30;
/** Weight applied to average completion percentage (0-1) */
const W_COMPLETION = 0.30;
/** Weight applied to recency of last play (0-1) */
const W_RECENCY = 0.20;
/** Weight applied to artist/genre affinity (0-1) */
const W_AFFINITY = 0.20;

/** Penalty multiplier per skip (applied after scoring) */
const SKIP_PENALTY_FACTOR = 0.08;

/** Half-life for recency decay in days */
const RECENCY_HALF_LIFE_DAYS = 14;

/** Maximum tracks in a Discover Weekly playlist */
const DISCOVER_WEEKLY_SIZE = 30;
/** Maximum tracks in a Daily Mix playlist */
const DAILY_MIX_SIZE = 25;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Exponential decay: score ∈ [0, 1] */
function recencyDecay(lastPlayedAt: string, halfLifeDays: number): number {
  const ageMs = Date.now() - new Date(lastPlayedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Normalise a value into [0, 1] given observed min/max */
function normalise(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Aggregate raw listening events into per-track score objects.
 *
 * @param events  – all ListeningEvents for a given user
 * @param allTracks – full track metadata catalogue (for enrichment)
 * @returns Map<trackId, TrackScore>
 */
export function aggregateEvents(
  events: ListeningEvent[],
  allTracks: Map<string, Track>,
): Map<string, TrackScore> {
  const scores = new Map<string, TrackScore>();

  for (const ev of events) {
    let entry = scores.get(ev.trackId);
    const track = allTracks.get(ev.trackId);

    if (!entry) {
      entry = {
        trackId: ev.trackId,
        name: track?.name ?? ev.trackName,
        artists: track?.artists ?? ev.artistNames.map((n, i) => ({ id: `unknown-${i}`, name: n })),
        album: track?.album ?? { id: 'unknown', name: 'Unknown Album' },
        durationMs: track?.durationMs ?? 0,
        explicit: track?.explicit ?? false,
        isrc: track?.isrc,
        spotifyUrl: track?.spotifyUrl ?? '',
        previewUrl: track?.previewUrl,
        playCount: 0,
        skipCount: 0,
        avgCompletion: 0,
        lastPlayedAt: ev.timestamp,
        score: 0,
        reason: 'frequently_played',
      };
      scores.set(ev.trackId, entry);
    }

    // Accumulate
    if (ev.eventType === 'play' || ev.eventType === 'complete') {
      entry.playCount += 1;
    }
    if (ev.eventType === 'skip') {
      entry.skipCount += 1;
    }

    // Rolling average completion
    const totalInteractions = entry.playCount + entry.skipCount;
    entry.avgCompletion =
      ((entry.avgCompletion * (totalInteractions - 1)) + ev.completionPercentage) /
      totalInteractions;

    // Latest play timestamp
    if (ev.timestamp > entry.lastPlayedAt) {
      entry.lastPlayedAt = ev.timestamp;
    }
  }

  return scores;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Compute final normalised scores for all candidate tracks.
 *
 * @param candidates  – aggregated TrackScores
 * @param artistAffinity – Map<artistName, affinityScore 0-1>
 */
export function computeScores(
  candidates: Map<string, TrackScore>,
  artistAffinity: Map<string, number>,
): TrackScore[] {
  const entries = Array.from(candidates.values());
  if (entries.length === 0) return [];

  // Find min/max for normalisation
  const playCounts = entries.map((e) => e.playCount);
  const minPlay = Math.min(...playCounts);
  const maxPlay = Math.max(...playCounts);

  for (const entry of entries) {
    // 1. Normalised play count
    const playSignal = normalise(entry.playCount, minPlay, maxPlay);

    // 2. Completion signal (already 0-100, normalise to 0-1)
    const completionSignal = entry.avgCompletion / 100;

    // 3. Recency signal
    const recencySignal = recencyDecay(entry.lastPlayedAt, RECENCY_HALF_LIFE_DAYS);

    // 4. Artist/genre affinity
    let affinitySignal = 0;
    for (const artist of entry.artists) {
      const a = artistAffinity.get(artist.name.toLowerCase());
      if (a !== undefined && a > affinitySignal) {
        affinitySignal = a;
      }
    }

    // Weighted sum
    let score =
      W_PLAY_COUNT * playSignal +
      W_COMPLETION * completionSignal +
      W_RECENCY * recencySignal +
      W_AFFINITY * affinitySignal;

    // Skip penalty
    score = Math.max(0, score - entry.skipCount * SKIP_PENALTY_FACTOR);

    // Determine primary reason
    let reason: RecommendationReason = 'frequently_played';
    if (completionSignal >= 0.85) reason = 'high_completion';
    if (affinitySignal >= 0.6) reason = 'similar_artist';
    if (recencySignal >= 0.8 && playSignal < 0.3) reason = 'recency_boost';

    entry.score = Math.min(1, score);
    entry.reason = reason;
  }

  // Sort descending by score
  entries.sort((a, b) => b.score - a.score);
  return entries;
}

// ─── Artist Affinity Builder ─────────────────────────────────────────────────

/**
 * Build an artist-affinity map from aggregated track scores.
 * Artists who appear in highly-scored tracks receive higher affinity.
 */
export function buildArtistAffinity(
  scores: Map<string, TrackScore>,
): Map<string, number> {
  const affinity = new Map<string, number>();
  const artistPlays = new Map<string, { total: number; avgCompletion: number; count: number }>();

  for (const entry of scores.values()) {
    for (const artist of entry.artists) {
      const key = artist.name.toLowerCase();
      const existing = artistPlays.get(key) || { total: 0, avgCompletion: 0, count: 0 };
      existing.total += entry.playCount;
      existing.avgCompletion =
        (existing.avgCompletion * existing.count + entry.avgCompletion) / (existing.count + 1);
      existing.count += 1;
      artistPlays.set(key, existing);
    }
  }

  // Normalise
  const totals = Array.from(artistPlays.values()).map((a) => a.total);
  const maxTotal = Math.max(1, ...totals);

  for (const [artist, data] of artistPlays) {
    const playNorm = data.total / maxTotal;
    const completionNorm = data.avgCompletion / 100;
    affinity.set(artist, playNorm * 0.6 + completionNorm * 0.4);
  }

  return affinity;
}

// ─── Playlist Generation ─────────────────────────────────────────────────────

/**
 * Select top tracks for a Discover Weekly playlist.
 *
 * Strategy: mix high-scoring familiar tracks (60%) with exploration
 * tracks from liked artists that the user hasn't played much (40%).
 */
export function generateDiscoverWeekly(
  rankedScores: TrackScore[],
  allTracks: Map<string, Track>,
  artistAffinity: Map<string, number>,
): MadeForYouTrackEntry[] {
  const selected = new Set<string>();
  const result: MadeForYouTrackEntry[] = [];

  // 60% from familiar high-scoring tracks
  const familiarCount = Math.floor(DISCOVER_WEEKLY_SIZE * 0.6);
  for (const ts of rankedScores) {
    if (result.length >= familiarCount) break;
    if (selected.has(ts.trackId)) continue;
    selected.add(ts.trackId);
    result.push(scoreToEntry(ts, result.length));
  }

  // 40% exploration: tracks by liked artists that haven't been played much
  const explorationCandidates: TrackScore[] = [];
  for (const [, track] of allTracks) {
    if (selected.has(track.id)) continue;
    const maxAffinity = Math.max(
      0,
      ...track.artists.map((a) => artistAffinity.get(a.name.toLowerCase()) ?? 0),
    );
    if (maxAffinity > 0.2) {
      explorationCandidates.push({
        trackId: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        durationMs: track.durationMs,
        explicit: track.explicit,
        isrc: track.isrc,
        spotifyUrl: track.spotifyUrl,
        previewUrl: track.previewUrl,
        playCount: 0,
        skipCount: 0,
        avgCompletion: 0,
        lastPlayedAt: '',
        score: maxAffinity * 0.5, // base exploration score
        reason: 'similar_artist',
      });
    }
  }

  // Shuffle exploration candidates to add variety
  shuffleArray(explorationCandidates);

  for (const ts of explorationCandidates) {
    if (result.length >= DISCOVER_WEEKLY_SIZE) break;
    if (selected.has(ts.trackId)) continue;
    selected.add(ts.trackId);
    result.push(scoreToEntry(ts, result.length));
  }

  return result;
}

/**
 * Select top tracks for a Daily Mix playlist.
 *
 * Strategy: take tracks that the user played recently and completed,
 * biasing towards a consistent genre/artist cluster.
 */
export function generateDailyMix(
  rankedScores: TrackScore[],
  mixNumber: number,
): MadeForYouTrackEntry[] {
  const result: MadeForYouTrackEntry[] = [];
  const selected = new Set<string>();

  // For different mix numbers, skip ahead in the ranked list to create varied mixes
  const offset = (mixNumber - 1) * DAILY_MIX_SIZE;
  const pool = rankedScores.slice(offset);

  for (const ts of pool) {
    if (result.length >= DAILY_MIX_SIZE) break;
    if (selected.has(ts.trackId)) continue;
    // Only include tracks with reasonable completion
    if (ts.avgCompletion < 20 && ts.playCount > 2) continue;
    selected.add(ts.trackId);
    result.push(scoreToEntry(ts, result.length));
  }

  return result;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function scoreToEntry(ts: TrackScore, position: number): MadeForYouTrackEntry {
  return {
    trackId: ts.trackId,
    position,
    score: ts.score,
    reason: ts.reason,
    name: ts.name,
    artists: ts.artists,
    album: ts.album,
    durationMs: ts.durationMs,
    explicit: ts.explicit,
    isrc: ts.isrc,
    spotifyUrl: ts.spotifyUrl,
    previewUrl: ts.previewUrl,
  };
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
