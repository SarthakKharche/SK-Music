import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import api from '../utils/api';
import { FiPlay, FiClock, FiArrowLeft, FiMusic } from 'react-icons/fi';
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
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  
  const [playlist, setPlaylist] = useState<SpotifyPlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        `/spotify/playlist/${playlistId}`
      );
      
      setPlaylist(response.data.playlist);
      setTracks(response.data.tracks);
    } catch (err) {
      console.error('Failed to load playlist:', err);
      setError('Failed to load playlist. Please try again.');
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
      <div className="flex items-center justify-center h-full bg-spotify-black">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-spotify-black text-white">
        <p className="text-spotify-lightgray mb-4">{error || 'Playlist not found'}</p>
        <button
          onClick={() => navigate(-1)}
          className="bg-spotify-green text-black px-6 py-2 rounded-full font-bold hover:scale-105 transition-transform"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-spotify-black pb-32">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#535353] to-spotify-black">
        {/* Back Button */}
        <div className="p-4">
          <button
            onClick={() => navigate(-1)}
            className="text-white hover:text-spotify-green transition-colors"
          >
            <FiArrowLeft size={24} />
          </button>
        </div>

        {/* Playlist Info */}
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 p-6 pt-0">
          {/* Cover Image */}
          {playlist.imageUrl ? (
            <img
              src={playlist.imageUrl}
              alt={playlist.name}
              className="w-48 h-48 md:w-56 md:h-56 object-cover shadow-2xl"
            />
          ) : (
            <div className="w-48 h-48 md:w-56 md:h-56 bg-spotify-gray flex items-center justify-center shadow-2xl">
              <FiMusic className="text-spotify-lightgray text-6xl" />
            </div>
          )}

          {/* Playlist Details */}
          <div className="text-center md:text-left">
            <p className="text-white text-xs uppercase font-bold mb-2">Playlist</p>
            <h1 className="text-white text-4xl md:text-6xl font-bold mb-4 line-clamp-2">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-spotify-lightgray text-sm mb-2 line-clamp-2">
                {playlist.description}
              </p>
            )}
            <p className="text-white text-sm">
              <span className="font-bold">{playlist.owner?.name || 'Spotify'}</span>
              <span className="text-spotify-lightgray"> • {playlist.trackCount} songs</span>
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 flex items-center gap-4">
        <button
          onClick={handlePlayAll}
          className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
        >
          <FiPlay className="text-black ml-1" size={28} />
        </button>
      </div>

      {/* Track List */}
      <div className="px-6">
        {/* Header Row */}
        <div className="grid grid-cols-[16px_4fr_2fr_1fr] gap-4 px-4 py-2 border-b border-white/10 text-spotify-lightgray text-sm">
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="flex justify-end">
            <FiClock />
          </span>
        </div>

        {/* Tracks */}
        <div className="mt-2">
          {tracks.map((track, index) => (
            <div
              key={track.id}
              onClick={() => handlePlayTrack(track, index)}
              className={`grid grid-cols-[16px_4fr_2fr_1fr] gap-4 px-4 py-2 rounded-md cursor-pointer group
                ${isCurrentTrack(track) ? 'bg-white/20' : 'hover:bg-white/10'}`}
            >
              {/* Track Number / Play Icon */}
              <div className="flex items-center justify-center text-spotify-lightgray">
                {isCurrentTrack(track) && isPlaying ? (
                  <div className="w-4 h-4 flex items-center justify-center">
                    <div className="flex gap-0.5">
                      <span className="w-0.5 h-3 bg-spotify-green animate-pulse"></span>
                      <span className="w-0.5 h-3 bg-spotify-green animate-pulse delay-75"></span>
                      <span className="w-0.5 h-3 bg-spotify-green animate-pulse delay-150"></span>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="group-hover:hidden text-sm">
                      {isCurrentTrack(track) ? (
                        <span className="text-spotify-green">{index + 1}</span>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <FiPlay className="hidden group-hover:block text-white" size={14} />
                  </>
                )}
              </div>

              {/* Track Info */}
              <div className="flex items-center gap-3 min-w-0">
                {track.album.imageUrl && (
                  <img
                    src={track.album.imageUrl}
                    alt={track.album.name}
                    className="w-10 h-10 rounded"
                  />
                )}
                <div className="min-w-0">
                  <p className={`font-medium truncate ${isCurrentTrack(track) ? 'text-spotify-green' : 'text-white'}`}>
                    {track.name}
                  </p>
                  <p className="text-spotify-lightgray text-sm truncate">
                    {track.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>
              </div>

              {/* Album */}
              <div className="flex items-center text-spotify-lightgray text-sm truncate">
                {track.album.name}
              </div>

              {/* Duration */}
              <div className="flex items-center justify-end text-spotify-lightgray text-sm">
                {formatDuration(track.durationMs)}
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
    </div>
  );
};

export default SpotifyPlaylistPage;
