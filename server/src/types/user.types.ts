/**
 * User model representing authenticated users
 */
export interface User {
  uid: string; // Google UID
  email: string;
  name: string;
  picture?: string;
  provider: 'google';
  spotifyConnected: boolean;
  spotifyUserId?: string;
  spotifyAccessToken?: string;
  spotifyRefreshToken?: string;
  spotifyTokenExpiry?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Spotify playlist metadata (cloud storage)
 */
export interface Playlist {
  id: string; // Spotify playlist ID
  userId: string; // Google UID
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
 * Track metadata (cloud storage)
 */
export interface Track {
  id: string; // Spotify track ID
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
  previewUrl?: string; // Spotify 30s preview (NOT for full playback)
  isOfflinePreferred: boolean; // User's offline preference
  addedAt: string;
}

/**
 * Offline preference sync record
 */
export interface OfflinePreference {
  userId: string;
  trackId: string;
  playlistId: string;
  isOfflinePreferred: boolean;
  markedAt: string;
}
