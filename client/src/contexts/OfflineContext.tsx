import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isOnline, addNetworkListeners } from '../utils/registerSW';
import { indexedDB } from '../services/indexedDB';
import { audioCacheManager } from '../services/audioCacheManager';
import api from '../utils/api';
import type { Track, OfflineSyncStatus } from '../types';

interface OfflineContextType {
  isOffline: boolean;
  syncStatus: Map<string, OfflineSyncStatus>;
  syncPlaylists: () => Promise<void>;
  toggleOfflineTrack: (track: Track) => Promise<void>;
  downloadPlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  getCacheSize: () => Promise<number>;
  clearCache: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [syncStatus, setSyncStatus] = useState<Map<string, OfflineSyncStatus>>(new Map());
  const [trackNames, setTrackNames] = useState<Map<string, string>>(new Map());

  /**
   * Initialize offline context
   */
  useEffect(() => {
    // Initialize IndexedDB
    indexedDB.init().catch(console.error);

    // Listen for network changes
    const cleanup = addNetworkListeners(
      () => {
        setIsOffline(false);
        console.log('📶 Online');
      },
      () => {
        setIsOffline(true);
        console.log('📵 Offline');
      }
    );

    // Listen to sync status updates
    const unsubscribe = audioCacheManager.onSyncStatus((status) => {
      setSyncStatus((prev) => new Map(prev).set(status.trackId, status));
    });

    return () => {
      cleanup();
      unsubscribe();
    };
  }, []);

  /**
   * Sync playlists from server to IndexedDB
   */
  const syncPlaylists = async (): Promise<void> => {
    if (isOffline) {
      console.warn('Cannot sync playlists while offline');
      return;
    }

    try {
      const response = await api.get<{ playlists: any[] }>('/spotify/playlists');
      await indexedDB.savePlaylists(response.data.playlists);
      console.log('✅ Playlists synced to IndexedDB');
    } catch (error) {
      console.error('Failed to sync playlists:', error);
    }
  };

  /**
   * Toggle offline preference for a track
   */
  const toggleOfflineTrack = async (track: Track): Promise<void> => {
    const newPreference = !track.isOfflinePreferred;

    if (newPreference) {
      setTrackNames((prev) => new Map(prev).set(track.id, track.name));
    }

    // Update local state
    await indexedDB.updateTrackOfflinePreference(track.id, newPreference);

    // Update server if online
    if (!isOffline) {
      try {
        await api.post('/user/offline-preferences', {
          trackIds: [track.id],
          isOfflinePreferred: newPreference,
        });
      } catch (error) {
        console.error('Failed to sync offline preference:', error);
      }
    }

    // Download or remove cache
    if (newPreference) {
      await audioCacheManager.cacheAudio(track);
    } else {
      await audioCacheManager.removeCachedAudio(track.id);
    }
  };

  /**
   * Download entire playlist for offline use
   */
  const downloadPlaylist = async (_playlistId: string, tracks: Track[]): Promise<void> => {
    setTrackNames((prev) => {
      const next = new Map(prev);
      tracks.forEach((t) => next.set(t.id, t.name));
      return next;
    });

    // Mark tracks as offline preferred
    await Promise.all(
      tracks.map((track) =>
        indexedDB.updateTrackOfflinePreference(track.id, true)
      )
    );

    // Sync to server if online
    if (!isOffline) {
      try {
        await api.post('/user/offline-preferences', {
          trackIds: tracks.map((t) => t.id),
          isOfflinePreferred: true,
        });
      } catch (error) {
        console.error('Failed to sync offline preferences:', error);
      }
    }

    // Download audio files
    await audioCacheManager.downloadTracksForOffline(tracks);
  };

  /**
   * Get total cache size
   */
  const getCacheSize = async (): Promise<number> => {
    return audioCacheManager.getCacheSize();
  };

  /**
   * Clear all cache
   */
  const clearCache = async (): Promise<void> => {
    await audioCacheManager.clearAllCache();
    setSyncStatus(new Map());
  };

  const value: OfflineContextType = {
    isOffline,
    syncStatus,
    syncPlaylists,
    toggleOfflineTrack,
    downloadPlaylist,
    getCacheSize,
    clearCache,
  };

  const activeDownloads = Array.from(syncStatus.values()).filter(
    (status) => status.status === 'downloading'
  );

  return (
    <OfflineContext.Provider value={value}>
      {children}
      {activeDownloads.length > 0 && (
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
          {activeDownloads.map((download) => {
            const trackName = trackNames.get(download.trackId) || 'Downloading Track';
            return (
              <div 
                key={download.trackId}
                className="p-4 rounded-xl bg-[#121212]/95 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md flex flex-col gap-2 pointer-events-auto transition-all"
              >
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-4 w-52">{trackName}</span>
                  <span className="text-spotify-green font-mono">{Math.round(download.progress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-spotify-green transition-all duration-150 ease-out" 
                    style={{ width: `${download.progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OfflineContext.Provider>
  );
};

/**
 * Custom hook to use offline context
 */
export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
};
