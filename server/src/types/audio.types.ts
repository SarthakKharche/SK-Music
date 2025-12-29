/**
 * Audio source metadata (NOT the audio file itself)
 */
export interface AudioSource {
  trackId: string;
  sourceUrl: string; // URL to external audio source
  quality: 'low' | 'medium' | 'high';
  format: string; // mp3, m4a, webm, etc.
  durationMs: number;
  resolvedAt: string;
  expiresAt?: string; // If URL has expiry
  youtubeId?: string; // YouTube video ID
  title?: string; // YouTube video title
  thumbnail?: string; // Thumbnail URL
}

/**
 * Audio resolver request
 */
export interface AudioResolveRequest {
  trackName: string;
  artistName: string;
  albumName?: string;
  durationMs?: number;
  isrc?: string; // International Standard Recording Code for accuracy
}

/**
 * Audio resolver response from external service
 */
export interface AudioResolveResponse {
  success: boolean;
  sources?: Array<{
    url: string;
    quality: 'low' | 'medium' | 'high';
    format: string;
    bitrate?: number;
    durationMs?: number;
  }>;
  error?: string;
}
