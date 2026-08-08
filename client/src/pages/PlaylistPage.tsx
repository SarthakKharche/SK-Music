import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { useOffline } from '../contexts/OfflineContext';
import { indexedDB } from '../services/indexedDB';
import { audioCacheManager } from '../services/audioCacheManager';
import api from '../utils/api';
import { 
  FiPlay, 
  FiDownload, 
  FiDownloadCloud, 
  FiCheck,
  FiClock,
  FiTrash2,
  FiMoreVertical
} from 'react-icons/fi';
import { formatDuration } from '../utils/helpers';
import type { Playlist, Track } from '../types';
import { TrackActionSheet } from '../components/common/TrackActionSheet';

const PlaylistPage: React.FC = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { toggleOfflineTrack, downloadPlaylist, isOffline, syncStatus } = useOffline();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionSheetTrack, setActionSheetTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      setSyncError(null);

      // Load from IndexedDB
      let playlistData = await indexedDB.getPlaylist(playlistId!);
      const tracksData = await indexedDB.getTracksByPlaylist(playlistId!);

      if (playlistId === 'custom_liked_songs') {
        const likedPlaylist: Playlist = {
          id: 'custom_liked_songs',
          userId: 'local',
          name: 'Liked Songs',
          description: 'Your favorite saved tracks',
          imageUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=60',
          trackCount: tracksData.length,
          isPublic: false,
          owner: { id: 'local', name: 'You' },
          spotifyUrl: '',
          lastSyncedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        playlistData = playlistData || likedPlaylist;
        playlistData.trackCount = tracksData.length;
        setPlaylist(playlistData);
      } else if (playlistData) {
        setPlaylist(playlistData);
      }

      setTracks(tracksData);
      await updateCachedStatus(tracksData);

      // Sync from server if online
      if (!isOffline) {
        try {
          await syncFromServer();
        } catch (syncErr: any) {
          console.error('Track sync failed:', syncErr);
          // Only show error if we have no cached tracks to fall back on
          if (tracksData.length === 0) {
            setSyncError(
              syncErr?.response?.status === 401
                ? 'Your Spotify session expired. Please reconnect Spotify in Settings.'
                : 'Failed to load tracks. Check your connection and try again.'
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to load playlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncFromServer = async () => {
    try {
      const url = playlistId?.startsWith('custom_')
        ? `/user/playlists/${playlistId}/tracks`
        : `/spotify/playlists/${playlistId}/tracks`;

      const response = await api.get<{ tracks: Track[] }>(url);

      await indexedDB.saveTracks(response.data.tracks);
      setTracks(response.data.tracks);
      await updateCachedStatus(response.data.tracks);
    } catch (error: any) {
      console.error('Sync failed:', error);
      // Re-throw so loadPlaylist can show error state if tracks remain empty
      throw error;
    }
  };

  const handleDeletePlaylist = async () => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      if (navigator.onLine && !playlistId?.startsWith('local_')) {
        await api.delete(`/user/playlists/${playlistId}`);
      }
      await indexedDB.deletePlaylist(playlistId!);
      window.dispatchEvent(new Event('playlists-updated'));
      navigate('/');
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      alert('Failed to delete playlist.');
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    try {
      if (navigator.onLine && playlistId?.startsWith('custom_')) {
        await api.delete(`/user/playlists/${playlistId}/tracks/${trackId}`);
      }
      await indexedDB.deleteTrack(trackId);
      await loadPlaylist();
    } catch (error) {
      console.error('Failed to remove track:', error);
    }
  };

  const updateCachedStatus = async (trackList: Track[]) => {
    const cached = new Set<string>();
    for (const track of trackList) {
      const isCached = await audioCacheManager.isTrackCached(track.id);
      if (isCached) {
        cached.add(track.id);
      }
    }
    setCachedTracks(cached);
  };

  const handlePlayTrack = async (track: Track) => {
    await playTrack(track, tracks);
  };

  const handlePlayAll = async () => {
    if (tracks.length > 0) {
      await playTrack(tracks[0], tracks);
    }
  };

  const handleToggleOffline = async (track: Track) => {
    await toggleOfflineTrack(track);
    await updateCachedStatus(tracks);
  };

  const handleDownloadAll = async () => {
    if (confirm(`Download all ${tracks.length} tracks for offline listening?`)) {
      await downloadPlaylist(playlistId!, tracks);
      await updateCachedStatus(tracks);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-spotify-lightgray">Playlist not found</p>
      </div>
    );
  }

  return (
    <div>
      {/* Playlist Header */}
      <div className="relative bg-gradient-to-b from-spotify-gray to-transparent">
        <div className="flex items-end gap-6 p-8">
          {playlist.imageUrl ? (
            <img
              src={playlist.imageUrl}
              alt={playlist.name}
              className="w-48 h-48 rounded-lg shadow-2xl"
            />
          ) : (
            <div className="w-48 h-48 bg-spotify-black rounded-lg flex items-center justify-center">
              <FiClock className="text-spotify-lightgray text-6xl" />
            </div>
          )}

          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
              Playlist
            </p>
            <h1 className="text-5xl font-bold text-white mb-4 text-shadow">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-spotify-lightgray mb-4">{playlist.description}</p>
            )}
            <p className="text-sm text-white">
              <span className="font-semibold">{playlist.owner.name}</span>
              <span className="mx-2">•</span>
              <span>{playlist.trackCount} tracks</span>
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <button
          onClick={handlePlayAll}
          className="bg-spotify-green text-white rounded-full p-4 hover:scale-105 transition-transform"
          title="Play all"
        >
          <FiPlay size={24} />
        </button>

        <button
          onClick={handleDownloadAll}
          className="btn-secondary text-sm font-semibold flex items-center justify-center gap-2 px-4 py-2 border border-white/10 hover:bg-white/10 rounded-full cursor-pointer transition-colors"
          disabled={isOffline}
        >
          <FiDownloadCloud />
          Download All
        </button>

        {playlistId?.startsWith('custom_') && (
          <button
            onClick={handleDeletePlaylist}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/20 rounded-full font-semibold transition-all cursor-pointer text-sm"
          >
            <FiTrash2 size={16} />
            Delete Playlist
          </button>
        )}
      </div>

      {/* Track List */}
      <div className="px-8 pb-8">
        {/* Sync error banner */}
        {syncError && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-500/30 rounded-lg flex items-center justify-between">
            <p className="text-red-400 text-sm">{syncError}</p>
            <button
              onClick={loadPlaylist}
              className="text-white bg-red-600 hover:bg-red-500 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {tracks.length === 0 && !syncError && (
          <div className="text-center py-16">
            <FiClock className="text-spotify-lightgray text-5xl mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">No tracks yet</p>
            <p className="text-spotify-lightgray text-sm mb-4">
              {isOffline ? 'Go online to load tracks.' : 'Tracks will appear here once synced.'}
            </p>
            {!isOffline && (
              <button
                onClick={loadPlaylist}
                className="text-spotify-green hover:text-green-400 text-sm font-semibold transition-colors"
              >
                Refresh
              </button>
            )}
          </div>
        )}

        <table className="w-full">
          <thead>
            <tr className="border-b border-spotify-gray text-spotify-lightgray text-sm hidden md:table-row">
              <th className="text-left pb-3 w-12">#</th>
              <th className="text-left pb-3">Title</th>
              <th className="text-left pb-3">Album</th>
              <th className="text-center pb-3 w-24">
                <FiClock />
              </th>
              <th className="text-center pb-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track, index) => {
              const isCached = cachedTracks.has(track.id);
              const status = syncStatus.get(track.id);

              return (
                <tr
                  key={track.id}
                  className="group hover:bg-spotify-gray transition-colors flex items-center justify-between py-2 md:table-row"
                >
                  <td className="py-3 hidden md:table-cell">
                    <button
                      onClick={() => handlePlayTrack(track)}
                      className="text-spotify-lightgray group-hover:text-white"
                    >
                      {index + 1}
                    </button>
                  </td>
                  <td className="py-2 md:py-3 flex-1 min-w-0" onClick={() => handlePlayTrack(track)}>
                    <div className="flex items-center gap-3">
                      {track.album?.imageUrl && (
                        <img
                          src={track.album.imageUrl}
                          alt={track.name}
                          className="w-12 h-12 md:hidden rounded-lg object-cover shadow flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-semibold text-sm md:text-base truncate">{track.name}</p>
                        <p className="text-xs md:text-sm text-spotify-lightgray truncate mt-0.5">
                          {track.artists.map((a: any) => a.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-spotify-lightgray text-sm hidden md:table-cell">
                    {track.album.name}
                  </td>
                  <td className="py-3 text-center text-spotify-lightgray text-sm hidden md:table-cell">
                    {formatDuration(track.durationMs)}
                  </td>
                  {/* Desktop Action Buttons */}
                  <td className="py-3 text-center hidden md:flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleToggleOffline(track)}
                      className={`p-2 rounded-full transition-colors ${
                        isCached
                          ? 'text-spotify-green hover:text-green-400'
                          : 'text-spotify-lightgray hover:text-white'
                      }`}
                      disabled={status?.status === 'downloading'}
                      title={isCached ? 'Remove from offline' : 'Download for offline'}
                    >
                      {status?.status === 'downloading' ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-spotify-green"></div>
                      ) : isCached ? (
                        <FiCheck />
                      ) : (
                        <FiDownload />
                      )}
                    </button>
                    {playlistId?.startsWith('custom_') && (
                      <button
                        onClick={() => handleRemoveTrack(track.id)}
                        className="p-2 rounded-full text-spotify-lightgray hover:text-red-500 hover:bg-white/5 transition-colors cursor-pointer"
                        title="Remove from playlist"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    )}
                  </td>

                  {/* Mobile 3-Dots Options Button */}
                  <td className="md:hidden flex items-center justify-end pl-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionSheetTrack(track);
                      }}
                      className="p-2 text-white/70 hover:text-white rounded-full active:bg-white/10"
                      title="Options"
                    >
                      <FiMoreVertical size={20} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile Track Action Sheet Modal */}
        <TrackActionSheet
          track={actionSheetTrack}
          isOpen={!!actionSheetTrack}
          onClose={() => setActionSheetTrack(null)}
          onRemoveFromPlaylist={playlistId?.startsWith('custom_') ? handleRemoveTrack : undefined}
        />
      </div>
    </div>
  );
};

export default PlaylistPage;
