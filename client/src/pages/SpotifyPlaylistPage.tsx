import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import api from '../utils/api';
import { FiPlay, FiClock, FiArrowLeft, FiMusic, FiMoreVertical } from 'react-icons/fi';
import { TrackActionSheet } from '../components/common/TrackActionSheet';
import type { Track } from '../types';

interface SpotifyPlaylistData {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  trackCount: number;
  owner?: {
    id: string;
    name: string;
  };
}

const SpotifyPlaylistPage: React.FC = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { playTrack, currentTrack } = usePlayer();
  
  const [playlist, setPlaylist] = useState<SpotifyPlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSheetTrack, setActionSheetTrack] = useState<Track | null>(null);
 
  useEffect(() => {
    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get<{ playlist: SpotifyPlaylistData; tracks: Track[] }>(
        `/spotify/playlists/${playlistId}`
      );
      
      setPlaylist(response.data.playlist);
      setTracks(response.data.tracks || []);
    } catch (err) {
      console.error('Failed to load playlist:', err);
      try {
        const ytRes = await api.get<{ name: string; description: string; imageUrl: string; tracks: Track[] }>(`/youtube-music/playlists/${playlistId}`);
        if (ytRes.data) {
          setPlaylist({
            id: playlistId!,
            name: ytRes.data.name || 'Playlist',
            description: ytRes.data.description || '',
            imageUrl: ytRes.data.imageUrl || '',
            trackCount: ytRes.data.tracks?.length || 0,
            owner: { id: 'sk-music', name: 'SK Music' }
          });
          setTracks(ytRes.data.tracks || []);
        } else {
          setError('Failed to load playlist. Please try again.');
        }
      } catch {
        setError('Failed to load playlist. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = async () => {
    if (tracks.length > 0) {
      await playTrack(tracks[0], tracks);
    }
  };

  const handlePlayTrack = async (track: Track, _index: number) => {
    await playTrack(track, tracks);
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isCurrentTrack = (track: Track): boolean => {
    return currentTrack?.id === track.id;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center px-4">
        <p className="text-spotify-lightgray mb-4">{error || 'Playlist not found'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 bg-spotify-green text-black font-bold rounded-full hover:scale-105 transition-transform"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="pb-32 w-full min-h-screen bg-[#121212]">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-spotify-gray to-transparent p-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors flex items-center justify-center"
        >
          <FiArrowLeft size={20} />
        </button>

        <div className="flex items-end gap-6">
          {playlist.imageUrl ? (
            <img
              src={playlist.imageUrl}
              alt={playlist.name}
              className="w-48 h-48 rounded-lg shadow-2xl object-cover"
            />
          ) : (
            <div className="w-48 h-48 bg-spotify-black rounded-lg flex items-center justify-center shadow-2xl">
              <FiMusic className="text-spotify-lightgray text-5xl" />
            </div>
          )}

          <div>
            <p className="text-sm font-semibold uppercase text-white mb-2">PLAYLIST</p>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-spotify-lightgray text-sm mb-4 max-w-2xl">{playlist.description}</p>
            )}
            <div className="flex items-center gap-2 text-sm text-spotify-lightgray">
              <span className="font-semibold text-white">{playlist.owner?.name || 'SK Music'}</span>
              <span>•</span>
              <span>{tracks.length} songs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Play Controls */}
      <div className="px-8 py-6">
        <button
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg disabled:opacity-50"
        >
          <FiPlay className="text-black text-2xl ml-1" fill="black" />
        </button>
      </div>

      {/* Track List - Search Page Format */}
      <div className="px-4 md:px-8 pb-8">
        <div className="hidden md:grid grid-cols-[48px_1fr_1fr_80px_48px] gap-3 px-4 py-2 text-spotify-lightgray text-sm border-b border-spotify-lightgray/20 sticky top-0 bg-[#121212] z-10">
          <div>#</div>
          <div>Title</div>
          <div>Album</div>
          <div className="text-right"><FiClock /></div>
          <div></div>
        </div>

        <div className="space-y-1 mt-2">
          {tracks.map((track, index) => (
            <div
              key={`${track.id}-${index}`}
              onClick={() => handlePlayTrack(track, index)}
              className="flex items-center justify-between md:grid md:grid-cols-[48px_1fr_1fr_80px_48px] gap-3 px-3 py-2.5 rounded-xl group cursor-pointer transition-colors hover:bg-white/10"
            >
              {/* Number / Play */}
              <div className="hidden md:flex items-center justify-center">
                <span className="group-hover:hidden text-spotify-lightgray">{index + 1}</span>
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
                  <p className={`font-semibold text-sm md:text-base truncate ${isCurrentTrack(track) ? 'text-spotify-green' : 'text-white'}`}>
                    {track.name}
                  </p>
                  <p className="text-xs md:text-sm text-spotify-lightgray truncate mt-0.5">
                    {track.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>
              </div>

              {/* Album */}
              <div className="hidden md:flex items-center text-spotify-lightgray text-sm truncate hover:underline">
                {track.album?.name}
              </div>

              {/* Duration */}
              <div className="hidden md:flex items-center justify-end text-spotify-lightgray text-sm">
                {formatDuration(track.durationMs)}
              </div>

              {/* 3-Dots Options Button */}
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
          ))}
        </div>

        {tracks.length === 0 && (
          <div className="text-center py-12 text-spotify-lightgray">
            <p>No tracks in this playlist</p>
          </div>
        )}
      </div>

      <TrackActionSheet
        track={actionSheetTrack}
        isOpen={!!actionSheetTrack}
        onClose={() => setActionSheetTrack(null)}
      />
    </div>
  );
};

export default SpotifyPlaylistPage;
