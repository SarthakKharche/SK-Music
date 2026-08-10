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
  FiArrowLeft,
  FiMoreVertical
} from 'react-icons/fi';
import { formatDuration } from '../utils/helpers';
import type { Track } from '../types';
import { TrackActionSheet } from '../components/common/TrackActionSheet';

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
  const { playTrack, currentTrack } = usePlayer();
  const { toggleOfflineTrack, syncStatus } = useOffline();
  
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSheetTrack, setActionSheetTrack] = useState<Track | null>(null);

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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-white p-6 text-center">
        <p className="text-white/60 mb-4">{error || 'Playlist not found.'}</p>
        <button
          onClick={() => navigate('/youtube-music')}
          className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-full text-white font-semibold transition-colors"
        >
          Back to YouTube Music
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gradient-to-b from-[#0a0f1d] to-[#04060c] pb-32 text-white min-h-screen">
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

      {/* Track List - Search Page Format */}
      <div className="px-4 md:px-8 pb-8">
        <div className="hidden md:grid grid-cols-[48px_1fr_1fr_80px_48px_48px] gap-3 px-4 py-2 text-white/50 text-sm border-b border-white/10 sticky top-0 bg-[#04060c] z-10">
          <div>#</div>
          <div>Title</div>
          <div>Album</div>
          <div className="text-right"><FiClock /></div>
          <div></div>
          <div></div>
        </div>

        <div className="space-y-1 mt-2">
          {playlist.tracks.map((track, index) => {
            const isCached = cachedTracks.has(track.id);
            const status = syncStatus.get(track.id);
            const isCurrentTrack = currentTrack?.id === track.id;

            return (
              <div
                key={`${track.id}-${index}`}
                onClick={() => handlePlayTrack(track)}
                className="flex items-center justify-between md:grid md:grid-cols-[48px_1fr_1fr_80px_48px_48px] gap-3 px-3 py-2.5 rounded-xl group cursor-pointer transition-colors hover:bg-white/10"
              >
                {/* Index / Play Button */}
                <div className="hidden md:flex items-center justify-center">
                  <span className="group-hover:hidden text-white/50">{index + 1}</span>
                  <FiPlay className="hidden group-hover:block text-white" size={14} fill="white" />
                </div>

                {/* Track Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={track.album?.imageUrl || '/placeholder-album.png'}
                    alt={track.name}
                    className="w-12 h-12 md:w-10 md:h-10 rounded-lg object-cover shadow flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold text-sm md:text-base truncate ${isCurrentTrack ? 'text-spotify-green' : 'text-white'}`}>
                      {track.name}
                    </p>
                    <p className="text-xs md:text-sm text-white/50 truncate mt-0.5">
                      {track.artists.map((a) => a.name).join(', ')}
                    </p>
                  </div>
                </div>

                {/* Album */}
                <div className="hidden md:flex items-center text-white/50 text-sm truncate hover:underline">
                  {track.album?.name}
                </div>

                {/* Duration */}
                <div className="hidden md:flex items-center justify-end text-white/50 text-sm">
                  {formatDuration(track.durationMs)}
                </div>

                {/* Download Button */}
                <div className="hidden md:flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleToggleOffline(e, track)}
                    className={`p-2 rounded-full transition-colors ${
                      isCached
                        ? 'text-spotify-green hover:text-green-400'
                        : 'text-white/50 hover:text-white'
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
                </div>

                {/* 3-Dots Options Menu */}
                <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActionSheetTrack(track)}
                    className="p-2 text-white/70 hover:text-white rounded-full active:bg-white/10 transition-colors"
                    title="Options"
                  >
                    <FiMoreVertical size={20} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TrackActionSheet
        track={actionSheetTrack}
        isOpen={!!actionSheetTrack}
        onClose={() => setActionSheetTrack(null)}
      />
    </div>
  );
};

export default YoutubePlaylistPage;
