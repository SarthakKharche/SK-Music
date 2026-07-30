/**
 * Made For You — Type Definitions
 *
 * Defines all types for the personalized playlist system:
 * - Playlist definitions (Discover Weekly, Daily Mix)
 * - Listening event tracking (play, skip, completion)
 * - Recommendation scoring models
 */

// ─── Playlist Types ──────────────────────────────────────────────────────────

/** The kind of personalized playlist */
export type MadeForYouPlaylistType = 'discover_weekly' | 'daily_mix';

/** Where the playlist data originated */
export type PlaylistSource = 'spotify_seed' | 'app_generated';

/** Reason a track was included in a recommendation */
export type RecommendationReason =
  | 'frequently_played'
  | 'high_completion'
  | 'similar_artist'
  | 'genre_match'
  | 'recency_boost'
  | 'seed_track';

/**
 * A single track entry within a Made-For-You playlist.
 * Contains full metadata so playlists work offline without extra lookups.
 */
export interface MadeForYouTrackEntry {
  trackId: string;
  position: number;
  score: number;
  reason: RecommendationReason;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    imageUrl?: string;
    releaseDate?: string;
  };
  durationMs: number;
  explicit: boolean;
  isrc?: string;
  spotifyUrl: string;
  previewUrl?: string;
}

/**
 * Persisted Made-For-You playlist document (Firestore: `madeForYouPlaylists`).
 */
export interface MadeForYouPlaylist {
  id: string;
  userId: string;
  type: MadeForYouPlaylistType;
  /** For daily mixes: 1, 2, 3 … */
  mixNumber?: number;
  displayName: string;
  subtitle: string;
  source: PlaylistSource;
  /** Original Spotify playlist ID when seeded */
  spotifyPlaylistId?: string;
  /** Inline track list — no extra collection needed */
  tracks: MadeForYouTrackEntry[];
  /** URL of a representative cover image */
  imageUrl?: string;
  generatedAt: string;
  /** ISO timestamp after which regeneration should run */
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Listening Event Types ───────────────────────────────────────────────────

/** Granular event type */
export type ListeningEventType = 'play' | 'skip' | 'complete';

/**
 * A single listening event (Firestore: `listeningEvents`).
 * Stored per-user, per-track interaction.
 */
export interface ListeningEvent {
  id: string;
  userId: string;
  trackId: string;
  eventType: ListeningEventType;
  /** 0–100 indicating how much of the track was heard */
  completionPercentage: number;
  timestamp: string;
  /** Denormalized for fast aggregation */
  trackName: string;
  artistNames: string[];
  genre?: string;
}

// ─── Aggregated Scoring ──────────────────────────────────────────────────────

/**
 * Intermediate structure used by the recommendation engine
 * to rank a candidate track.
 */
export interface TrackScore {
  trackId: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    imageUrl?: string;
    releaseDate?: string;
  };
  durationMs: number;
  explicit: boolean;
  isrc?: string;
  spotifyUrl: string;
  previewUrl?: string;
  /** Raw aggregated metrics */
  playCount: number;
  skipCount: number;
  avgCompletion: number;
  lastPlayedAt: string;
  /** Final normalised score (0–1) after weighting */
  score: number;
  reason: RecommendationReason;
}

// ─── API Request / Response Types ────────────────────────────────────────────

export interface ImportMadeForYouRequest {
  /** If false, re-import from Spotify even if playlists exist */
  skipIfExists?: boolean;
}

export interface ImportMadeForYouResponse {
  imported: number;
  playlists: Array<{
    id: string;
    type: MadeForYouPlaylistType;
    displayName: string;
    trackCount: number;
  }>;
}

export interface RecordListeningEventRequest {
  trackId: string;
  eventType: ListeningEventType;
  completionPercentage: number;
  trackName: string;
  artistNames: string[];
  genre?: string;
}

export interface RegenerateResponse {
  regenerated: number;
  playlists: Array<{
    id: string;
    type: MadeForYouPlaylistType;
    displayName: string;
    trackCount: number;
  }>;
}
