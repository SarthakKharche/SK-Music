import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { useOffline } from '../contexts/OfflineContext';
import { audioCacheManager } from '../services/audioCacheManager';
import api from '../utils/api';
import { 
  FiPlay, 
  FiDownload, 
  FiCheck,
  FiClock,
  FiMusic,
  FiArrowLeft
} from 'react-icons/fi';
import { formatDuration } from '../utils/helpers';
import { indexedDB } from '../services/indexedDB';
import type { Track, Playlist } from '../types';

interface PlaylistInfo {
  name: string;
  description: string;
  imageUrl: string;
  tracks: Track[];
}

const YoutubePlaylistPage: React.FC = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const [searchParams] = useSearchParams();
  const titleQuery = searchParams.get('title');
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { toggleOfflineTrack, syncStatus } = useOffline();
  
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [customPlaylists, setCustomPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    indexedDB.getPlaylists().then(lists => {
      setCustomPlaylists(lists.filter(l => l.id.startsWith('custom_')));
    });

    const handlePlaylistsUpdated = () => {
      indexedDB.getPlaylists().then(lists => {
        setCustomPlaylists(lists.filter(l => l.id.startsWith('custom_')));
      });
    };
    window.addEventListener('playlists-updated', handlePlaylistsUpdated);
    return () => {
      window.removeEventListener('playlists-updated', handlePlaylistsUpdated);
    };
  }, []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId, titleQuery]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = titleQuery 
        ? `/youtube-music/playlists/${playlistId}?title=${encodeURIComponent(titleQuery)}`
        : `/youtube-music/playlists/${playlistId}`;
      const response = await api.get<PlaylistInfo>(url);
      setPlaylist(response.data);
      await updateCachedStatus(response.data.tracks);
    } catch (err: any) {
      console.error('Failed to load YouTube playlist:', err);
      setError(err.response?.data?.error || 'Failed to load YouTube Music playlist.');
    } finally {
      setLoading(false);
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
    // Set YouTube ID mapping in localStorage so playback works immediately
    const cleanYtId = track.id.replace('yt-', '');
    localStorage.setItem(`youtube_${track.id}`, cleanYtId);
    
    await playTrack(track, playlist?.tracks || []);
  };

  const handlePlayAll = async () => {
    if (playlist && playlist.tracks.length > 0) {
      const firstTrack = playlist.tracks[0];
      const cleanYtId = firstTrack.id.replace('yt-', '');
      localStorage.setItem(`youtube_${firstTrack.id}`, cleanYtId);
      await playTrack(firstTrack, playlist.tracks);
    }
  };

  const handleToggleOffline = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    const cleanYtId = track.id.replace('yt-', '');
    localStorage.setItem(`youtube_${track.id}`, cleanYtId);
    await toggleOfflineTrack(track);
    await updateCachedStatus(playlist?.tracks || []);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-white">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/60 tracking-wider">Loading YouTube playlist...</p>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-4">
          <FiMusic size={24} />
        </div>
        <h3 className="text-xl font-bold mb-2">Could Not Load Playlist</h3>
        <p className="text-white/60 max-w-md mb-6">{error || 'Playlist not found'}</p>
        <button
          onClick={loadPlaylist}
          className="px-6 py-2.5 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#0a0f1d] to-[#04060c] pb-24 text-white">
      {/* Back Button */}
      <div className="p-4 pl-8 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="text-white/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2 text-sm font-semibold"
        >
          <FiArrowLeft size={20} />
          Back
        </button>
      </div>

      {/* Playlist Header */}
      <div className="relative bg-gradient-to-b from-red-950/20 to-transparent">
        <div className="flex flex-col md:flex-row items-end gap-6 p-8 pt-4">
          {playlist.imageUrl ? (
            <img
              src={playlist.imageUrl}
              alt={playlist.name}
              className="w-48 h-48 rounded-2xl shadow-2xl object-cover border border-white/10"
            />
          ) : (
            <div className="w-48 h-48 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
              <FiMusic className="text-white/20 text-6xl" />
            </div>
          )}

          <div className="flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-500">
              YouTube Playlist
            </p>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-white/60 text-sm max-w-2xl">{playlist.description}</p>
            )}
            <p className="text-sm text-white/40">
              <span>{playlist.tracks.length} tracks</span>
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <button
          onClick={handlePlayAll}
          className="bg-red-600 hover:bg-red-700 text-white rounded-full p-4 hover:scale-105 transition-transform shadow-lg flex items-center justify-center"
          title="Play all"
        >
          <FiPlay size={24} fill="white" />
        </button>
      </div>

      {/* Track List */}
      <div className="px-8 pb-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-white/50 text-sm font-semibold">
              <th className="pb-3 w-12 text-center">#</th>
              <th className="pb-3">Title</th>
              <th className="pb-3 hidden md:table-cell">Album</th>
              <th className="pb-3 w-24 text-center">
                <FiClock className="mx-auto" />
              </th>
              <th className="pb-3 w-16 text-center"></th>
              <th className="pb-3 w-24 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {playlist.tracks.map((track, index) => {
              const isCached = cachedTracks.has(track.id);
              const status = syncStatus.get(track.id);

              return (
                <tr
                  key={track.id}
                  className="group hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="py-4 text-center text-white/40 group-hover:text-white font-medium">
                    <button
                      onClick={() => handlePlayTrack(track)}
                      className="hover:text-red-500 transition-colors"
                    >
                      {index + 1}
                    </button>
                  </td>
                  <td className="py-4 flex items-center gap-3">
                    {track.album?.imageUrl && (
                      <img
                        src={track.album.imageUrl}
                        alt={track.name}
                        className="w-10 h-10 rounded-lg object-cover bg-white/5"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate group-hover:text-red-400 transition-colors cursor-pointer" onClick={() => handlePlayTrack(track)}>
                        {track.name}
                      </p>
                      <p className="text-sm text-white/50 truncate">
                        {track.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  </td>
                  <td className="py-4 text-white/50 text-sm hidden md:table-cell truncate max-w-xs">
                    {track.album.name}
                  </td>
                  <td className="py-4 text-center text-white/50 text-sm">
                    {formatDuration(track.durationMs)}
                  </td>
                  <td className="py-4 text-center">
                    <button
                      onClick={(e) => handleToggleOffline(e, track)}
                      className={`p-2 rounded-full transition-all duration-300 ${
                        isCached
                          ? 'text-green-500 hover:text-green-400'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                      }`}
                      disabled={status?.status === 'downloading'}
                      title={isCached ? 'Remove from offline' : 'Download for offline'}
                    >
                      {status?.status === 'downloading' ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-red-500"></div>
                      ) : isCached ? (
                        <FiCheck size={16} />
                      ) : (
                        <FiDownload size={16} />
                      )}
                    </button>
                  </td>
                  <td className="py-4 text-center">
                    <select
                      onChange={async (e) => {
                        const targetPlaylistId = e.target.value;
                        if (!targetPlaylistId) return;
                        try {
                          if (navigator.onLine) {
                            await api.post(`/user/playlists/${targetPlaylistId}/tracks`, { track });
                          }
                          await indexedDB.saveTracks([{ ...track, playlistId: targetPlaylistId }]);
                          alert('Track added to playlist!');
                          e.target.value = '';
                        } catch (err) {
                          console.error(err);
                          alert('Failed to add track');
                        }
                      }}
                      className="bg-white/5 border border-white/10 text-white/50 text-[11px] rounded px-1.5 py-1 hover:text-white hover:bg-white/10 cursor-pointer outline-none max-w-[100px] truncate"
                    >
                      <option value="">+ Add</option>
                      {customPlaylists.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
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

export default YoutubePlaylistPage;
