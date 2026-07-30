/**
 * User types
 */
export interface User {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  spotifyConnected: boolean;
  spotifyUserId?: string;
}

/**
 * Playlist types
 */
export interface Playlist {
  id: string;
  userId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  trackCount: number;
  isPublic: boolean;
  owner: {
    id: string;
    name: string;
  };
  spotifyUrl: string;
  lastSyncedAt: string;
  createdAt: string;
}

/**
 * Track types
 */
export interface Track {
  id: string;
  playlistId: string;
  userId: string;
  name: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
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
  isOfflinePreferred: boolean;
  addedAt: string;
}

/**
 * Audio source types
 */
export interface AudioSource {
  trackId: string;
  sourceUrl: string;
  quality: 'low' | 'medium' | 'high';
  format: string;
  durationMs: number;
  resolvedAt: string;
  expiresAt?: string;
  youtubeId?: string;
  title?: string;
  thumbnail?: string;
}

/**
 * Cached audio metadata (IndexedDB)
 */
export interface CachedAudio {
  trackId: string;
  blob: Blob;
  format: string;
  quality: 'low' | 'medium' | 'high';
  durationMs: number;
  cachedAt: string;
  lastAccessedAt: string;
  sizeBytes: number;
  track?: Track; // Store track metadata for offline display
}

/**
 * Player state types
 */
export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  queue: Track[];
  queueIndex: number;
  repeat: 'off' | 'one' | 'all';
  shuffle: boolean;
}

/**
 * Offline sync status
 */
export interface OfflineSyncStatus {
  trackId: string;
  status: 'pending' | 'downloading' | 'cached' | 'failed';
  progress: number;
  error?: string;
}

// ─── Made For You Types ──────────────────────────────────────────────────────

export type MadeForYouPlaylistType = 'discover_weekly' | 'daily_mix';
export type PlaylistSource = 'spotify_seed' | 'app_generated';
export type ListeningEventType = 'play' | 'skip' | 'complete';
export type RecommendationReason =
  | 'frequently_played'
  | 'high_completion'
  | 'similar_artist'
  | 'genre_match'
  | 'recency_boost'
  | 'seed_track';

export interface MadeForYouTrackEntry {
  trackId: string;
  position: number;
  score: number;
  reason: RecommendationReason;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: { id: string; name: string; imageUrl?: string; releaseDate?: string };
  durationMs: number;
  explicit: boolean;
  isrc?: string;
  spotifyUrl: string;
  previewUrl?: string;
}

export interface MadeForYouPlaylist {
  id: string;
  userId: string;
  type: MadeForYouPlaylistType;
  mixNumber?: number;
  displayName: string;
  subtitle: string;
  source: PlaylistSource;
  spotifyPlaylistId?: string;
  tracks: MadeForYouTrackEntry[];
  imageUrl?: string;
  generatedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListeningStats {
  totalEvents: number;
  totalPlays: number;
  totalSkips: number;
  totalCompletes: number;
  topArtists: Array<{ name: string; playCount: number }>;
  avgCompletion: number;
}
