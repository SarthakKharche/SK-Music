import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { CachedAudio, Track, Playlist } from '../types';

/**
 * IndexedDB Schema
 */
interface MusicDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: {
      'by-playlist': string;
      'by-offline': number;
    };
  };
  playlists: {
    key: string;
    value: Playlist;
  };
  audio: {
    key: string;
    value: CachedAudio;
    indexes: {
      'by-size': number;
      'by-accessed': string;
    };
  };
  metadata: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'sk-music-db';
const DB_VERSION = 1;

/**
 * IndexedDB Manager
 * Handles offline data storage and retrieval
 */
class IndexedDBManager {
  private db: IDBPDatabase<MusicDB> | null = null;

  /**
   * Initialize database
   */
  async init(): Promise<void> {
    this.db = await openDB<MusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Tracks store
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('by-playlist', 'playlistId');
          trackStore.createIndex('by-offline', 'isOfflinePreferred');
        }

        // Playlists store
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }

        // Audio cache store
        if (!db.objectStoreNames.contains('audio')) {
          const audioStore = db.createObjectStore('audio', { keyPath: 'trackId' });
          audioStore.createIndex('by-size', 'sizeBytes');
          audioStore.createIndex('by-accessed', 'lastAccessedAt');
        }

        // Metadata store (for app state, sync timestamps, etc.)
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });

    console.log('✅ IndexedDB initialized');
  }

  /**
   * Get database instance
   */
  private getDB(): IDBPDatabase<MusicDB> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  // ==================== PLAYLISTS ====================

  /**
   * Save playlists to IndexedDB
   */
  async savePlaylists(playlists: Playlist[]): Promise<void> {
    const db = this.getDB();
    const tx = db.transaction('playlists', 'readwrite');
    
    await Promise.all([
      ...playlists.map((playlist) => tx.store.put(playlist)),
      tx.done,
    ]);
  }

  /**
   * Get all playlists
   */
  async getPlaylists(): Promise<Playlist[]> {
    const db = this.getDB();
    return db.getAll('playlists');
  }

  /**
   * Get playlist by ID
   */
  async getPlaylist(playlistId: string): Promise<Playlist | undefined> {
    const db = this.getDB();
    return db.get('playlists', playlistId);
  }

  /**
   * Delete playlist
   */
  async deletePlaylist(playlistId: string): Promise<void> {
    const db = this.getDB();
    await db.delete('playlists', playlistId);
  }

  // ==================== TRACKS ====================

  /**
   * Save tracks to IndexedDB
   */
  async saveTracks(tracks: Track[]): Promise<void> {
    const db = this.getDB();
    const tx = db.transaction('tracks', 'readwrite');
    
    await Promise.all([
      ...tracks.map((track) => tx.store.put(track)),
      tx.done,
    ]);
  }

  /**
   * Get all tracks
   */
  async getTracks(): Promise<Track[]> {
    const db = this.getDB();
    return db.getAll('tracks');
  }

  /**
   * Get tracks by playlist ID
   */
  async getTracksByPlaylist(playlistId: string): Promise<Track[]> {
    const db = this.getDB();
    return db.getAllFromIndex('tracks', 'by-playlist', playlistId);
  }

  /**
   * Get track by ID
   */
  async getTrack(trackId: string): Promise<Track | undefined> {
    const db = this.getDB();
    return db.get('tracks', trackId);
  }

  /**
   * Get offline preferred tracks
   */
  async getOfflinePreferredTracks(): Promise<Track[]> {
    const db = this.getDB();
    return db.getAllFromIndex('tracks', 'by-offline', 1);
  }

  /**
   * Update track offline preference
   */
  async updateTrackOfflinePreference(
    trackId: string,
    isOfflinePreferred: boolean
  ): Promise<void> {
    const db = this.getDB();
    const track = await db.get('tracks', trackId);
    
    if (track) {
      track.isOfflinePreferred = isOfflinePreferred;
      await db.put('tracks', track);
    }
  }

  // ==================== AUDIO CACHE ====================

  /**
   * Cache audio blob
   */
  async cacheAudio(cachedAudio: CachedAudio): Promise<void> {
    const db = this.getDB();
    await db.put('audio', cachedAudio);
  }

  /**
   * Get cached audio
   */
  async getCachedAudio(trackId: string): Promise<CachedAudio | undefined> {
    const db = this.getDB();
    const audio = await db.get('audio', trackId);
    
    if (audio) {
      // Update last accessed time
      audio.lastAccessedAt = new Date().toISOString();
      await db.put('audio', audio);
    }
    
    return audio;
  }

  /**
   * Check if audio is cached
   */
  async isAudioCached(trackId: string): Promise<boolean> {
    const db = this.getDB();
    const audio = await db.get('audio', trackId);
    return !!audio;
  }

  /**
   * Delete cached audio
   */
  async deleteCachedAudio(trackId: string): Promise<void> {
    const db = this.getDB();
    await db.delete('audio', trackId);
  }

  /**
   * Get total cache size
   */
  async getCacheSize(): Promise<number> {
    const db = this.getDB();
    const allAudio = await db.getAll('audio');
    return allAudio.reduce((total, audio) => total + audio.sizeBytes, 0);
  }

  /**
   * Get all cached audio
   */
  async getAllCachedAudio(): Promise<CachedAudio[]> {
    const db = this.getDB();
    return db.getAll('audio');
  }

  /**
   * Clear old cache (LRU eviction)
   */
  async clearOldCache(maxSizeBytes: number): Promise<void> {
    const db = this.getDB();
    const allAudio = await db.getAllFromIndex('audio', 'by-accessed');
    
    let totalSize = allAudio.reduce((sum, audio) => sum + audio.sizeBytes, 0);
    
    // Remove oldest accessed items until under max size
    for (const audio of allAudio) {
      if (totalSize <= maxSizeBytes) break;
      
      await db.delete('audio', audio.trackId);
      totalSize -= audio.sizeBytes;
    }
  }

  /**
   * Clear all cached audio
   */
  async clearAllCache(): Promise<void> {
    const db = this.getDB();
    await db.clear('audio');
  }

  // ==================== METADATA ====================

  /**
   * Set metadata value
   */
  async setMetadata(key: string, value: any): Promise<void> {
    const db = this.getDB();
    await db.put('metadata', { key, value });
  }

  /**
   * Get metadata value
   */
  async getMetadata(key: string): Promise<any> {
    const db = this.getDB();
    const result = await db.get('metadata', key);
    return result?.value;
  }

  /**
   * Delete metadata
   */
  async deleteMetadata(key: string): Promise<void> {
    const db = this.getDB();
    await db.delete('metadata', key);
  }

  // ==================== LISTENING HISTORY ====================

  /**
   * Add track to listening history
   */
  async addToHistory(track: Track): Promise<void> {
    const db = this.getDB();
    const historyKey = 'listening_history';
    
    // Get existing history
    const historyData = await db.get('metadata', historyKey);
    const history: Array<{ track: Track; playedAt: string; playCount: number }> = historyData?.value || [];
    
    // Check if track already in history
    const existingIndex = history.findIndex(h => h.track.id === track.id);
    
    if (existingIndex >= 0) {
      // Update existing entry
      history[existingIndex].playedAt = new Date().toISOString();
      history[existingIndex].playCount = (history[existingIndex].playCount || 1) + 1;
      // Move to front
      const [entry] = history.splice(existingIndex, 1);
      history.unshift(entry);
    } else {
      // Add new entry at the front
      history.unshift({
        track,
        playedAt: new Date().toISOString(),
        playCount: 1,
      });
    }
    
    // Keep only last 500 entries
    const trimmedHistory = history.slice(0, 500);
    
    await db.put('metadata', { key: historyKey, value: trimmedHistory });
  }

  /**
   * Get listening history
   */
  async getListeningHistory(): Promise<Array<{ track: Track; playedAt: string; playCount: number }>> {
    const db = this.getDB();
    const historyData = await db.get('metadata', 'listening_history');
    return historyData?.value || [];
  }

  /**
   * Get all tracks that have been listened to at least once
   */
  async getListenedTracks(): Promise<Track[]> {
    const history = await this.getListeningHistory();
    return history.map(h => h.track);
  }

  /**
   * Search listening history
   */
  async searchHistory(query: string): Promise<Array<{ track: Track; playedAt: string; playCount: number }>> {
    const history = await this.getListeningHistory();
    const lowerQuery = query.toLowerCase();
    
    return history.filter(h => 
      h.track.name.toLowerCase().includes(lowerQuery) ||
      h.track.artists.some(a => a.name.toLowerCase().includes(lowerQuery)) ||
      h.track.album.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Clear listening history
   */
  async clearHistory(): Promise<void> {
    const db = this.getDB();
    await db.delete('metadata', 'listening_history');
  }

  // ==================== UTILITIES ====================

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    const db = this.getDB();
    await Promise.all([
      db.clear('tracks'),
      db.clear('playlists'),
      db.clear('audio'),
      db.clear('metadata'),
    ]);
  }

  /**
   * Export database statistics
   */
  async getStats(): Promise<{
    trackCount: number;
    playlistCount: number;
    cachedAudioCount: number;
    totalCacheSizeBytes: number;
  }> {
    const db = this.getDB();
    
    const [tracks, playlists, audio] = await Promise.all([
      db.getAll('tracks'),
      db.getAll('playlists'),
      db.getAll('audio'),
    ]);

    const totalCacheSizeBytes = audio.reduce(
      (sum, item) => sum + item.sizeBytes,
      0
    );

    return {
      trackCount: tracks.length,
      playlistCount: playlists.length,
      cachedAudioCount: audio.length,
      totalCacheSizeBytes,
    };
  }

  /**
   * Get all tracks that are available offline (have cached audio)
   * Returns tracks with their metadata from either the cached audio or listening history
   */
  async getOfflineTracks(): Promise<Track[]> {
    const db = this.getDB();
    const cachedAudio = await db.getAll('audio');
    
    if (cachedAudio.length === 0) {
      return [];
    }

    // Get track IDs that have cached audio
    const cachedTrackIds = new Set(cachedAudio.map(a => a.trackId));
    
    // Try to get track metadata from cached audio first
    const tracksFromCache: Track[] = cachedAudio
      .filter(a => a.track)
      .map(a => a.track as Track);

    // For tracks without embedded metadata, try to find them in listening history
    const missingTrackIds = cachedAudio
      .filter(a => !a.track)
      .map(a => a.trackId);

    if (missingTrackIds.length > 0) {
      // Get listening history to find metadata for cached tracks
      const historyData = await db.get('metadata', 'listening_history');
      if (historyData && Array.isArray(historyData.data)) {
        const historyTracks = historyData.data
          .filter((item: { track: Track }) => missingTrackIds.includes(item.track.id))
          .map((item: { track: Track }) => item.track);
        tracksFromCache.push(...historyTracks);
      }
    }

    // Remove duplicates by track ID
    const uniqueTracks = new Map<string, Track>();
    for (const track of tracksFromCache) {
      if (cachedTrackIds.has(track.id)) {
        uniqueTracks.set(track.id, track);
      }
    }

    return Array.from(uniqueTracks.values());
  }
}

// Export singleton instance
export const indexedDB = new IndexedDBManager();
