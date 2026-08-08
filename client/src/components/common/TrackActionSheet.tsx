import React, { useState, useEffect } from 'react';
import { FiDownload, FiCheck, FiPlus, FiHeart, FiX, FiTrash2 } from 'react-icons/fi';
import { useOffline } from '../../contexts/OfflineContext';
import { audioCacheManager } from '../../services/audioCacheManager';
import { indexedDB } from '../../services/indexedDB';
import api from '../../utils/api';
import type { Track, Playlist } from '../../types';

interface TrackActionSheetProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
}

export const TrackActionSheet: React.FC<TrackActionSheetProps> = ({
  track,
  isOpen,
  onClose,
  onRemoveFromPlaylist,
}) => {
  const { toggleOfflineTrack, syncStatus } = useOffline();
  const [isCached, setIsCached] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [addingPlaylistId, setAddingPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    if (track && isOpen) {
      audioCacheManager.isTrackCached(track.id).then(setIsCached);
      indexedDB.getTracksByPlaylist('custom_liked_songs').then((liked) => {
        setIsLiked(liked.some((t) => t.id === track.id));
      });
      indexedDB.getPlaylists().then((lists) => {
        setPlaylists(lists.filter((l) => l.id.startsWith('custom_')));
      });
    }
  }, [track, isOpen]);

  if (!isOpen || !track) return null;

  const handleToggleDownload = async () => {
    await toggleOfflineTrack(track);
    const cached = await audioCacheManager.isTrackCached(track.id);
    setIsCached(cached);
  };

  const handleToggleLike = async () => {
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    if (nextLiked) {
      await indexedDB.saveTracks([{ ...track, playlistId: 'custom_liked_songs' }]);
      if (navigator.onLine) {
        api.post('/user/liked-tracks', { track }).catch(() => {});
      }
    } else {
      await indexedDB.deleteTrack(track.id);
      if (navigator.onLine) {
        api.delete(`/user/liked-tracks/${track.id}`).catch(() => {});
      }
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      setAddingPlaylistId(playlistId);
      if (navigator.onLine && playlistId.startsWith('custom_')) {
        await api.post(`/user/playlists/${playlistId}/tracks`, { track });
      }
      await indexedDB.saveTracks([{ ...track, playlistId }]);
      window.dispatchEvent(new Event('playlists-updated'));
      onClose();
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
    } finally {
      setAddingPlaylistId(null);
    }
  };

  const status = syncStatus.get(track.id);
  const artistName = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-md animate-fadeIn" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#121624] border-t border-white/10 rounded-t-3xl p-6 shadow-2xl space-y-5 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Track Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={track.album?.imageUrl || '/placeholder-album.png'}
              alt={track.name}
              className="w-12 h-12 rounded-lg object-cover shadow-md"
            />
            <div className="min-w-0">
              <h3 className="text-white font-bold text-base truncate">{track.name}</h3>
              <p className="text-spotify-lightgray text-sm truncate">{artistName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/60 hover:text-white rounded-full bg-white/5">
            <FiX size={20} />
          </button>
        </div>

        {/* Action List */}
        {!showPlaylistMenu ? (
          <div className="space-y-2">
            {/* Download Option */}
            <button
              onClick={handleToggleDownload}
              className="w-full flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-spotify-green">
                {status?.status === 'downloading' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-spotify-green"></div>
                ) : isCached ? (
                  <FiCheck size={20} />
                ) : (
                  <FiDownload size={20} />
                )}
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">{isCached ? 'Downloaded' : 'Download for Offline'}</p>
                <p className="text-xs text-spotify-lightgray">{isCached ? 'Available in offline storage' : 'Save audio binary to device'}</p>
              </div>
            </button>

            {/* Save / Like Option */}
            <button
              onClick={handleToggleLike}
              className="w-full flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-spotify-green">
                <FiHeart size={20} fill={isLiked ? '#1DB954' : 'none'} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">{isLiked ? 'Saved to Liked Songs' : 'Save to Liked Songs'}</p>
                <p className="text-xs text-spotify-lightgray">{isLiked ? 'In your favorite tracks' : 'Add to your library'}</p>
              </div>
            </button>

            {/* Add to Playlist Option */}
            <button
              onClick={() => setShowPlaylistMenu(true)}
              className="w-full flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-cyan-400">
                <FiPlus size={20} />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Add to Playlist</p>
                <p className="text-xs text-spotify-lightgray">Choose a playlist to save this song</p>
              </div>
            </button>

            {/* Remove from Playlist Option (If applicable) */}
            {onRemoveFromPlaylist && (
              <button
                onClick={() => {
                  onRemoveFromPlaylist(track.id);
                  onClose();
                }}
                className="w-full flex items-center gap-4 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              >
                <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                  <FiTrash2 size={20} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Remove from Playlist</p>
                  <p className="text-xs text-red-400/70">Delete this track from playlist</p>
                </div>
              </button>
            )}
          </div>
        ) : (
          /* Select Playlist Sub-Menu */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-bold text-sm">Select Playlist</h4>
              <button onClick={() => setShowPlaylistMenu(false)} className="text-xs text-spotify-green hover:underline">
                Back
              </button>
            </div>
            {playlists.length === 0 ? (
              <p className="text-sm text-spotify-lightgray py-4 text-center">No custom playlists found. Create one first!</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handleAddToPlaylist(pl.id)}
                    disabled={addingPlaylistId === pl.id}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-lg text-white text-sm"
                  >
                    <span className="truncate">{pl.name}</span>
                    {addingPlaylistId === pl.id ? (
                      <span className="text-xs text-spotify-green animate-pulse">Adding...</span>
                    ) : (
                      <FiPlus size={16} className="text-white/60" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
