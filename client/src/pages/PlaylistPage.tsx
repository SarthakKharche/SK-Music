import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  FiClock 
} from 'react-icons/fi';
import { formatDuration } from '../utils/helpers';
import type { Playlist, Track } from '../types';

const PlaylistPage: React.FC = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const { playTrack } = usePlayer();
  const { toggleOfflineTrack, downloadPlaylist, isOffline, syncStatus } = useOffline();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);

      // Load from IndexedDB
      const playlistData = await indexedDB.getPlaylist(playlistId!);
      const tracksData = await indexedDB.getTracksByPlaylist(playlistId!);

      if (playlistData) {
        setPlaylist(playlistData);
      }

      if (tracksData.length > 0) {
        setTracks(tracksData);
        await updateCachedStatus(tracksData);
      }

      // Sync from server if online
      if (!isOffline) {
        await syncFromServer();
      }
    } catch (error) {
      console.error('Failed to load playlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncFromServer = async () => {
    try {
      const response = await api.get<{ tracks: Track[] }>(
        `/spotify/playlists/${playlistId}/tracks`
      );

      await indexedDB.saveTracks(response.data.tracks);
      setTracks(response.data.tracks);
      await updateCachedStatus(response.data.tracks);
    } catch (error) {
      console.error('Sync failed:', error);
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
          className="btn-secondary"
          disabled={isOffline}
        >
          <FiDownloadCloud className="inline mr-2" />
          Download All
        </button>
      </div>

      {/* Track List */}
      <div className="px-8 pb-8">
        <table className="w-full">
          <thead>
            <tr className="border-b border-spotify-gray text-spotify-lightgray text-sm">
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
                  className="group hover:bg-spotify-gray transition-colors"
                >
                  <td className="py-3">
                    <button
                      onClick={() => handlePlayTrack(track)}
                      className="text-spotify-lightgray group-hover:text-white"
                    >
                      {index + 1}
                    </button>
                  </td>
                  <td className="py-3">
                    <div>
                      <p className="text-white font-medium">{track.name}</p>
                      <p className="text-sm text-spotify-lightgray">
                        {track.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  </td>
                  <td className="py-3 text-spotify-lightgray text-sm">
                    {track.album.name}
                  </td>
                  <td className="py-3 text-center text-spotify-lightgray text-sm">
                    {formatDuration(track.durationMs)}
                  </td>
                  <td className="py-3 text-center">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlaylistPage;
