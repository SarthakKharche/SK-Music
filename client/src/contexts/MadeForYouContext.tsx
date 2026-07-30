/**
 * Made For You — React Context
 *
 * Provides application-wide state for the personalised playlists system:
 *  - Playlist state (loading, data, errors)
 *  - Listening event recording with offline queue
 *  - Auto-import on first login
 *  - Background regeneration
 *
 * Designed as a context so that any component can record events or
 * access playlist data without prop-drilling.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  importMadeForYou,
  getMadeForYouPlaylists,
  getMadeForYouPlaylist,
  regeneratePlaylists,
  recordListeningEvent,
  recordListeningEventsBatch,
  getListeningStats,
} from '../services/madeForYouApi';
import { indexedDB } from '../services/indexedDB';
import type {
  MadeForYouPlaylist,
  ListeningEventType,
  ListeningStats,
  Track,
} from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueuedEvent {
  trackId: string;
  eventType: ListeningEventType;
  completionPercentage: number;
  trackName: string;
  artistNames: string[];
  genre?: string;
  queuedAt: string;
}

interface MadeForYouContextType {
  /** All personalized playlists */
  playlists: MadeForYouPlaylist[];
  /** Whether playlists are loading */
  loading: boolean;
  /** Error message, if any */
  error: string | null;
  /** Fetch / refresh playlists from server */
  fetchPlaylists: () => Promise<void>;
  /** Get a single playlist by ID */
  fetchPlaylist: (id: string) => Promise<MadeForYouPlaylist | null>;
  /** Trigger initial import from Spotify */
  importFromSpotify: (skipIfExists?: boolean) => Promise<void>;
  /** Force-regenerate all playlists */
  regenerate: () => Promise<void>;
  /** Record a listening event (plays, skips, completions) */
  recordEvent: (
    track: Track,
    eventType: ListeningEventType,
    completionPercentage: number,
  ) => void;
  /** Whether the initial import has been done */
  hasImported: boolean;
  /** Listening stats */
  stats: ListeningStats | null;
  /** Fetch listening stats */
  fetchStats: () => Promise<void>;
}

const MadeForYouContext = createContext<MadeForYouContextType | undefined>(undefined);

// ─── Offline Event Queue ─────────────────────────────────────────────────────

const EVENT_QUEUE_KEY = 'mfyEventQueue';

function getQueuedEvents(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(EVENT_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function enqueueEvent(event: QueuedEvent): void {
  const queue = getQueuedEvents();
  queue.push(event);
  // Cap at 500 to prevent unbounded growth
  localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(queue.slice(-500)));
}

function clearEventQueue(): void {
  localStorage.removeItem(EVENT_QUEUE_KEY);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export const MadeForYouProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [playlists, setPlaylists] = useState<MadeForYouPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasImported, setHasImported] = useState(false);
  const [stats, setStats] = useState<ListeningStats | null>(null);

  // Ref for event batching
  const eventBufferRef = useRef<QueuedEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  // ─── Fetch playlists ────────────────────────────────────────────────────

  const fetchPlaylists = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    try {
      const data = await getMadeForYouPlaylists();
      setPlaylists(data);
      setHasImported(data.length > 0);

      // Cache in IndexedDB for offline
      await indexedDB.setMetadata('madeForYouPlaylists', data);
    } catch (err: any) {
      console.error('[MadeForYou] Fetch error:', err);
      setError('Failed to load personalised playlists');

      // Fall back to cached data
      try {
        const cached = await indexedDB.getMetadata('madeForYouPlaylists');
        if (cached && Array.isArray(cached)) {
          setPlaylists(cached);
          setHasImported(cached.length > 0);
        }
      } catch {
        // IndexedDB also unavailable
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // ─── Fetch single playlist ──────────────────────────────────────────────

  const fetchPlaylist = useCallback(
    async (id: string): Promise<MadeForYouPlaylist | null> => {
      try {
        return await getMadeForYouPlaylist(id);
      } catch (err) {
        console.error('[MadeForYou] Fetch playlist error:', err);
        // Try cache
        const cached = await indexedDB.getMetadata('madeForYouPlaylists');
        if (cached && Array.isArray(cached)) {
          return cached.find((p: MadeForYouPlaylist) => p.id === id) ?? null;
        }
        return null;
      }
    },
    [],
  );

  // ─── Import from Spotify ────────────────────────────────────────────────

  const importFromSpotify = useCallback(async (skipIfExists = true) => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    try {
      await importMadeForYou(skipIfExists);
      await fetchPlaylists();
    } catch (err: any) {
      console.error('[MadeForYou] Import error:', err);
      setError('Failed to import playlists from Spotify');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fetchPlaylists]);

  // ─── Regenerate ─────────────────────────────────────────────────────────

  const regenerate = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    try {
      await regeneratePlaylists();
      await fetchPlaylists();
    } catch (err: any) {
      console.error('[MadeForYou] Regenerate error:', err);
      setError('Failed to regenerate playlists');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fetchPlaylists]);

  // ─── Event Recording ───────────────────────────────────────────────────

  /**
   * Flush buffered events to the server (or queue for later if offline).
   */
  const flushEvents = useCallback(async () => {
    const buffer = [...eventBufferRef.current];
    eventBufferRef.current = [];

    if (buffer.length === 0) return;

    if (!navigator.onLine) {
      // Save to offline queue
      for (const ev of buffer) enqueueEvent(ev);
      return;
    }

    try {
      if (buffer.length === 1) {
        await recordListeningEvent(buffer[0]);
      } else {
        await recordListeningEventsBatch(buffer);
      }
    } catch {
      // Network failure — save to offline queue
      for (const ev of buffer) enqueueEvent(ev);
    }
  }, []);

  /**
   * Record a listening event. Events are buffered for 3 seconds and
   * flushed in batches to reduce API calls.
   */
  const recordEvent = useCallback(
    (track: Track, eventType: ListeningEventType, completionPercentage: number) => {
      const event: QueuedEvent = {
        trackId: track.id,
        eventType,
        completionPercentage,
        trackName: track.name,
        artistNames: track.artists.map((a) => a.name),
        queuedAt: new Date().toISOString(),
      };

      eventBufferRef.current.push(event);

      // Reset flush timer
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(() => {
        flushEvents();
      }, 3000);
    },
    [flushEvents],
  );

  // ─── Sync offline event queue when coming back online ───────────────────

  useEffect(() => {
    const syncOfflineQueue = async () => {
      if (!navigator.onLine || !isAuthenticated) return;

      const queue = getQueuedEvents();
      if (queue.length === 0) return;

      try {
        await recordListeningEventsBatch(queue);
        clearEventQueue();
        console.log(`[MadeForYou] Synced ${queue.length} offline events`);
      } catch (err) {
        console.warn('[MadeForYou] Failed to sync offline events:', err);
      }
    };

    window.addEventListener('online', syncOfflineQueue);
    // Try once on mount
    syncOfflineQueue();

    return () => window.removeEventListener('online', syncOfflineQueue);
  }, [isAuthenticated]);

  // ─── Stats ──────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await getListeningStats();
      setStats(data);
    } catch (err) {
      console.error('[MadeForYou] Stats error:', err);
    }
  }, [isAuthenticated]);

  // ─── Auto-load on auth ─────────────────────────────────────────────────

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchPlaylists();
    }
  }, [isAuthenticated, user, fetchPlaylists]);

  // ─── Cleanup ────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      // Flush remaining events on unmount
      if (eventBufferRef.current.length > 0) {
        for (const ev of eventBufferRef.current) enqueueEvent(ev);
        eventBufferRef.current = [];
      }
    };
  }, []);

  // ─── Context value ─────────────────────────────────────────────────────

  const value: MadeForYouContextType = {
    playlists,
    loading,
    error,
    fetchPlaylists,
    fetchPlaylist,
    importFromSpotify,
    regenerate,
    recordEvent,
    hasImported,
    stats,
    fetchStats,
  };

  return (
    <MadeForYouContext.Provider value={value}>{children}</MadeForYouContext.Provider>
  );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useMadeForYou = (): MadeForYouContextType => {
  const ctx = useContext(MadeForYouContext);
  if (!ctx) throw new Error('useMadeForYou must be used within MadeForYouProvider');
  return ctx;
};
