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
      let fetchedPlaylist: Playlist | null = null;
      let fetchedTracks: Track[] = [];

      if (playlistId?.startsWith('custom_')) {
        const res = await api.get<{ tracks: Track[] }>(`/user/playlists/${playlistId}/tracks`);
        fetchedTracks = res.data.tracks || [];
      } else if (playlistId?.startsWith('dw_') || playlistId?.startsWith('dm1_') || playlistId?.startsWith('dm2_') || playlistId?.startsWith('mfy_')) {
        // Made For You Playlist
        const res = await api.get<{ playlist: any }>(`/made-for-you/playlists/${playlistId}`);
        if (res.data?.playlist) {
          fetchedPlaylist = {
            id: res.data.playlist.id,
            userId: 'local',
            name: res.data.playlist.title || res.data.playlist.name,
            description: res.data.playlist.description || '',
            imageUrl: res.data.playlist.imageUrl || '',
            trackCount: res.data.playlist.tracks?.length || 0,
            isPublic: true,
            owner: { id: 'sk-music', name: 'SK Music' },
            spotifyUrl: '',
            lastSyncedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };
          fetchedTracks = res.data.playlist.tracks || [];
        }
      } else if (playlistId?.startsWith('PL') || playlistId?.startsWith('RD') || playlistId?.startsWith('yt_') || playlistId?.startsWith('youtube_')) {
        // YouTube Music Playlist
        const cleanYtId = playlistId.replace(/^yt_|^youtube_/, '');
        const res = await api.get<{ name: string; description: string; imageUrl: string; tracks: Track[] }>(`/youtube-music/playlists/${cleanYtId}`);
        if (res.data) {
          fetchedPlaylist = {
            id: playlistId,
            userId: 'local',
            name: res.data.name || 'YouTube Playlist',
            description: res.data.description || '',
            imageUrl: res.data.imageUrl || '',
            trackCount: res.data.tracks?.length || 0,
            isPublic: true,
            owner: { id: 'youtube', name: 'YouTube Music' },
            spotifyUrl: '',
            lastSyncedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };
          fetchedTracks = res.data.tracks || [];
        }
      } else {
        // Spotify Playlist with robust YouTube/JioSaavn fallback
        try {
          const res = await api.get<{ tracks: Track[] }>(`/spotify/playlists/${playlistId}/tracks`);
          fetchedTracks = res.data?.tracks || [];
        } catch (spotifyErr) {
          console.warn('Spotify playlist fetch failed, attempting fallback resolution:', spotifyErr);
          try {
            const res = await api.get<{ name: string; description: string; imageUrl: string; tracks: Track[] }>(`/youtube-music/playlists/${playlistId}`);
            if (res.data?.tracks && res.data.tracks.length > 0) {
              fetchedTracks = res.data.tracks;
              if (res.data.name) {
                fetchedPlaylist = {
                  id: playlistId!,
                  userId: 'local',
                  name: res.data.name,
                  description: res.data.description || '',
                  imageUrl: res.data.imageUrl || '',
                  trackCount: res.data.tracks.length,
                  isPublic: true,
                  owner: { id: 'sk-music', name: 'SK Music' },
                  spotifyUrl: '',
                  lastSyncedAt: new Date().toISOString(),
                  createdAt: new Date().toISOString()
                };
              }
            }
          } catch {
            throw spotifyErr;
          }
        }
      }

      if (fetchedPlaylist) {
        setPlaylist(fetchedPlaylist);
        await indexedDB.savePlaylists([fetchedPlaylist]);
      }

      if (fetchedTracks.length > 0) {
        await indexedDB.saveTracks(fetchedTracks);
        setTracks(fetchedTracks);
        await updateCachedStatus(fetchedTracks);
      }
    } catch (error: any) {
      console.error('Sync failed:', error);
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
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <p className="text-spotify-lightgray">Playlist not found</p>
      </div>
    );
  }

  return (
    <div className="pb-32 w-full min-h-screen bg-[#121212]">
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
            <div className="w-48 h-48 bg-spotify-black rounded-lg flex items-center justify-center shadow-2xl">
              <FiPlay className="text-spotify-lightgray text-5xl" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold uppercase text-white mb-2">Playlist</p>
            <h1 className="text-5xl font-bold text-white mb-4">{playlist.name}</h1>
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

      {/* Controls Bar */}
      <div className="flex items-center gap-4 p-8">
        <button
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
          className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          title="Play All"
        >
          <FiPlay className="text-spotify-black text-2xl ml-1" fill="black" />
        </button>

        {tracks.length > 0 && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-white hover:border-white transition-colors text-sm font-semibold"
          >
            <FiDownloadCloud className="text-lg" />
            Download All
          </button>
        )}

        {playlistId?.startsWith('custom_') && playlistId !== 'custom_liked_songs' && (
          <button
            onClick={handleDeletePlaylist}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold ml-auto"
          >
            <FiTrash2 className="text-lg" />
            Delete Playlist
          </button>
        )}
      </div>

      {/* Track List - Search Page Format */}
      <div className="px-4 md:px-8 pb-8">
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

        {tracks.length > 0 && (
          <div>
            {/* Table Header (Hidden on Mobile) */}
            <div className="hidden md:grid grid-cols-[48px_1fr_1fr_80px_48px_48px] gap-3 px-4 py-2 text-spotify-lightgray text-sm border-b border-spotify-lightgray/20 sticky top-0 bg-[#121212] z-10">
              <div>#</div>
              <div>Title</div>
              <div>Album</div>
              <div className="text-right"><FiClock /></div>
              <div className="text-center"></div>
              <div className="text-center"></div>
            </div>

            {/* Track Rows */}
            <div className="space-y-1 mt-2">
              {tracks.map((track, index) => {
                const isCached = cachedTracks.has(track.id);
                const status = syncStatus.get(track.id);

                return (
                  <div
                    key={`${track.id}-${index}`}
                    onClick={() => handlePlayTrack(track)}
                    className="flex items-center justify-between md:grid md:grid-cols-[48px_1fr_1fr_80px_48px_48px] gap-3 px-3 py-2.5 rounded-xl group cursor-pointer transition-colors hover:bg-white/10"
                  >
                    {/* Index / Play Button (Desktop only) */}
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
                        <p className="font-semibold text-sm md:text-base text-white truncate">
                          {track.name}
                        </p>
                        <p className="text-xs md:text-sm text-spotify-lightgray truncate mt-0.5">
                          {track.explicit && (
                            <span className="inline-flex items-center justify-center w-4 h-4 bg-spotify-lightgray/30 text-spotify-lightgray text-[10px] rounded mr-1">E</span>
                          )}
                          {track.artists.map((a: any) => a.name).join(', ')}
                        </p>
                      </div>
                    </div>

                    {/* Album (Desktop only) */}
                    <div className="hidden md:flex items-center text-spotify-lightgray text-sm truncate hover:underline">
                      {track.album?.name}
                    </div>

                    {/* Duration (Desktop only) */}
                    <div className="hidden md:flex items-center justify-end text-spotify-lightgray text-sm">
                      {formatDuration(track.durationMs)}
                    </div>

                    {/* Offline Download Button (Desktop only) */}
                    <div className="hidden md:flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
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
                          <FiCheck size={16} />
                        ) : (
                          <FiDownload size={16} />
                        )}
                      </button>
                    </div>

                    {/* 3-Dots Options Menu Button (Mobile & Desktop) */}
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
        )}

        {/* Track Action Sheet Modal */}
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
