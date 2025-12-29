/**
 * Spotify OAuth token response
 */
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * Spotify user profile
 */
export interface SpotifyUserProfile {
  id: string;
  display_name: string;
  email: string;
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  country: string;
  product: string;
}

/**
 * Spotify playlist response
 */
export interface SpotifyPlaylistResponse {
  id: string;
  name: string;
  description: string;
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  tracks: {
    total: number;
    href: string;
  };
  public: boolean;
  owner: {
    id: string;
    display_name: string;
  };
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify track object
 */
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
  album: {
    id: string;
    name: string;
    images: Array<{
      url: string;
      height: number;
      width: number;
    }>;
    release_date: string;
  };
  duration_ms: number;
  explicit: boolean;
  external_ids: {
    isrc?: string;
  };
  external_urls: {
    spotify: string;
  };
  preview_url: string | null;
}

/**
 * Spotify playlist tracks response
 */
export interface SpotifyPlaylistTracksResponse {
  items: Array<{
    added_at: string;
    track: SpotifyTrack;
  }>;
  next: string | null;
  total: number;
}

/**
 * Spotify search response
 */
export interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[];
    next: string | null;
    total: number;
  };
}
