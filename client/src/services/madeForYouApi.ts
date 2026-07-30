/**
 * Made For You — API Client
 *
 * Wraps all /api/made-for-you endpoints for use in React components.
 * Uses the shared Axios instance from utils/api for auth headers and error handling.
 */

import api from '../utils/api';
import type {
  MadeForYouPlaylist,
  ListeningEventType,
  ListeningStats,
} from '../types';

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Import "Made For You" playlists from Spotify.
 * Only reads from Spotify — never modifies.
 */
export async function importMadeForYou(
  skipIfExists = true,
): Promise<{
  imported: number;
  playlists: Array<{ id: string; type: string; displayName: string; trackCount: number }>;
}> {
  const res = await api.post('/made-for-you/import', { skipIfExists });
  return res.data;
}

// ─── Playlists ───────────────────────────────────────────────────────────────

/**
 * Fetch all personalised playlists for the current user.
 * The server will auto-regenerate expired playlists before responding.
 */
export async function getMadeForYouPlaylists(): Promise<MadeForYouPlaylist[]> {
  const res = await api.get<{ playlists: MadeForYouPlaylist[] }>('/made-for-you/playlists');
  return res.data.playlists;
}

/**
 * Fetch a single personalised playlist by ID (includes full track list).
 */
export async function getMadeForYouPlaylist(playlistId: string): Promise<MadeForYouPlaylist> {
  const res = await api.get<{ playlist: MadeForYouPlaylist }>(`/made-for-you/playlists/${playlistId}`);
  return res.data.playlist;
}

// ─── Regeneration ────────────────────────────────────────────────────────────

/**
 * Force-regenerate all personalised playlists immediately.
 */
export async function regeneratePlaylists(): Promise<{
  regenerated: number;
  playlists: Array<{ id: string; type: string; displayName: string; trackCount: number }>;
}> {
  const res = await api.post('/made-for-you/regenerate');
  return res.data;
}

// ─── Events ──────────────────────────────────────────────────────────────────

/**
 * Record a single listening event.
 */
export async function recordListeningEvent(data: {
  trackId: string;
  eventType: ListeningEventType;
  completionPercentage: number;
  trackName: string;
  artistNames: string[];
  genre?: string;
}): Promise<void> {
  await api.post('/made-for-you/events', data);
}

/**
 * Batch-record listening events (e.g. when syncing offline events).
 */
export async function recordListeningEventsBatch(
  events: Array<{
    trackId: string;
    eventType: ListeningEventType;
    completionPercentage: number;
    trackName: string;
    artistNames: string[];
    genre?: string;
  }>,
): Promise<void> {
  await api.post('/made-for-you/events/batch', { events });
}

// ─── Stats ───────────────────────────────────────────────────────────────────

/**
 * Fetch aggregated listening statistics.
 */
export async function getListeningStats(): Promise<ListeningStats> {
  const res = await api.get<ListeningStats>('/made-for-you/stats');
  return res.data;
}

// ─── Data Management ─────────────────────────────────────────────────────────

/**
 * Delete all Made-For-You data (playlists + events).
 */
export async function deleteMadeForYouData(): Promise<void> {
  await api.delete('/made-for-you/data');
}
