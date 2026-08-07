import { useEffect, useState, useCallback } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { indexedDB } from '../services/indexedDB';
import { FiClock, FiPlay, FiSearch, FiMusic, FiPause, FiDownload, FiTrash2, FiHardDrive } from 'react-icons/fi';
import { formatDuration } from '../utils/helpers';
import type { Track } from '../types';

const OfflinePage: React.FC = () => {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheSize, setCacheSize] = useState<number>(0);

  const loadOfflineTracks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get only tracks that have cached audio blobs
      const tracks = await indexedDB.getOfflineTracks();
      const size = await indexedDB.getCacheSize();
      
      setCacheSize(size);
      
      // Filter by search query if present
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const filtered = tracks.filter(track => 
          track.name.toLowerCase().includes(query) ||
          track.artists?.some(a => a.name.toLowerCase().includes(query)) ||
          track.album?.name?.toLowerCase().includes(query)
        );
        setOfflineTracks(filtered);
      } else {
        setOfflineTracks(tracks);
      }
    } catch (err) {
      console.error('Failed to load offline tracks:', err);
      setError('Failed to load offline tracks');
      setOfflineTracks([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadOfflineTracks();
  }, [loadOfflineTracks]);

  const handlePlayTrack = async (track: Track, index: number) => {
    console.log('Playing offline track:', track.name, 'at index:', index);
    
    if (!track || !track.id) {
      console.error('Invalid track:', track);
      return;
    }
    
    // Create queue from current position
    const queueFromIndex = offlineTracks.slice(index);
    await playTrack(track, queueFromIndex);
  };

  const handleDeleteTrack = async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering play
    
    if (confirm('Remove this song from offline storage?')) {
      try {
        await indexedDB.deleteCachedAudio(trackId);
        await loadOfflineTracks(); // Refresh the list
      } catch (err) {
        console.error('Failed to delete cached audio:', err);
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (loading && offlineTracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <FiMusic className="text-spotify-lightgray text-6xl mb-4" />
        <p className="text-spotify-lightgray">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-6 mb-6">
          <div className="bg-gradient-to-br from-green-600 to-emerald-500 p-8 rounded-lg shadow-2xl">
            <FiDownload className="text-white text-5xl" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-spotify-lightgray mb-1">Downloads</p>
            <h1 className="text-5xl font-bold text-white mb-2">Offline Music</h1>
            <p className="text-spotify-lightgray flex items-center gap-4">
              <span>{offlineTracks.length} {offlineTracks.length === 1 ? 'song' : 'songs'}</span>
              {cacheSize > 0 && (
                <span className="flex items-center gap-1">
                  <FiHardDrive size={14} />
                  {formatBytes(cacheSize)}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        {offlineTracks.length > 0 && (
          <div className="relative max-w-md">
            <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-spotify-lightgray" />
            <input
              type="text"
              placeholder="Search in downloaded songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-spotify-gray border border-spotify-lightgray/20 rounded-full py-3 pl-12 pr-4 text-white placeholder-spotify-lightgray focus:outline-none focus:border-white transition-colors"
            />
          </div>
        )}
      </div>

      {/* Track List */}
      {offlineTracks.length === 0 ? (
        <div className="text-center py-16">
          <FiDownload className="text-spotify-lightgray text-6xl mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            {searchQuery ? 'No matching songs' : 'No downloaded songs'}
          </h2>
          <p className="text-spotify-lightgray max-w-md mx-auto">
            {searchQuery 
              ? 'Try a different search term'
              : 'Download songs while online to listen offline. Look for the download button on tracks and playlists.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Table Header */}
          <div className="grid grid-cols-[48px_1fr_1fr_80px_48px] gap-4 px-4 py-2 text-spotify-lightgray text-sm border-b border-spotify-lightgray/20">
            <div>#</div>
            <div>Title</div>
            <div>Album</div>
            <div className="text-right">
              <FiClock className="inline" />
            </div>
            <div></div>
          </div>

          {/* Tracks */}
          {offlineTracks.map((track, index) => {
            const isCurrentTrack = currentTrack?.id === track.id;

            return (
              <div
                key={`${track.id}-${index}`}
                onClick={() => handlePlayTrack(track, index)}
                className={`grid grid-cols-[48px_1fr_1fr_80px_48px] gap-4 px-4 py-2 rounded-md group cursor-pointer transition-colors ${
                  isCurrentTrack ? 'bg-spotify-gray' : 'hover:bg-spotify-gray'
                }`}
              >
                {/* Index / Play Button */}
                <div className="flex items-center justify-center">
                  {isCurrentTrack && isPlaying ? (
                    <img 
                      src="https://open.spotifycdn.com/cdn/images/equaliser-animated-green.f5eb96f2.gif" 
                      alt="Playing" 
                      className="w-4 h-4 group-hover:hidden" 
                    />
                  ) : (
                    <span className={`group-hover:hidden ${isCurrentTrack ? 'text-spotify-green' : 'text-spotify-lightgray'}`}>
                      {index + 1}
                    </span>
                  )}
                  {isCurrentTrack && isPlaying ? (
                    <FiPause className="hidden group-hover:block text-white" size={16} />
                  ) : (
                    <FiPlay className="hidden group-hover:block text-white" size={16} />
                  )}
                </div>

                {/* Track Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <img
                      src={track.album?.imageUrl || '/placeholder-album.png'}
                      alt={track.album?.name || 'Album'}
                      className="w-10 h-10 rounded shadow"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-spotify-green rounded-full p-0.5" title="Available offline">
                      <FiDownload size={10} className="text-black" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${isCurrentTrack ? 'text-spotify-green' : 'text-white'}`}>
                      {track.name || 'Unknown Track'}
                    </p>
                    <p className="text-sm text-spotify-lightgray truncate">
                      {track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist'}
                    </p>
                  </div>
                </div>

                {/* Album */}
                <div className="flex items-center text-spotify-lightgray text-sm truncate">
                  {track.album?.name || 'Unknown Album'}
                </div>

                {/* Duration */}
                <div className="flex items-center justify-end text-spotify-lightgray text-sm font-mono">
                  {formatDuration(track.durationMs && track.durationMs > 0 ? track.durationMs : 180000)}
                </div>

                {/* Delete Button */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={(e) => handleDeleteTrack(track.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-spotify-lightgray hover:text-red-500 transition-all p-1"
                    title="Remove from downloads"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OfflinePage;
