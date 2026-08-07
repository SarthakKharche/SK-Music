import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiPlus, FiHeart, FiMusic, FiArrowDown, FiGrid, FiList } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { indexedDB } from '../services/indexedDB';
import api from '../utils/api';
import type { Playlist } from '../types';

const LibraryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedSongCount, setLikedSongCount] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  useEffect(() => {
    loadLibraryData();
    window.addEventListener('playlists-updated', loadLibraryData);
    return () => window.removeEventListener('playlists-updated', loadLibraryData);
  }, [user]);

  const loadLibraryData = async () => {
    try {
      // Load Liked Songs count
      const likedTracks = await indexedDB.getTracksByPlaylist('custom_liked_songs');
      setLikedSongCount(likedTracks.length);

      // Load all playlists
      const localPlaylists = await indexedDB.getPlaylists();
      setPlaylists(localPlaylists);

      if (user && navigator.onLine) {
        try {
          const res = await api.get<{ playlists: Playlist[] }>('/user/playlists');
          if (res.data?.playlists && res.data.playlists.length > 0) {
            await indexedDB.savePlaylists(res.data.playlists);
            const updated = await indexedDB.getPlaylists();
            setPlaylists(updated);
          }
        } catch {
          // Ignore server sync failure offline
        }
      }
    } catch (err) {
      console.error('Failed to load library data:', err);
    }
  };

  const handleCreatePlaylist = async () => {
    const name = prompt('Enter playlist name:');
    if (!name || !name.trim()) return;

    try {
      const description = prompt('Enter playlist description (optional):') || '';
      
      if (navigator.onLine && user) {
        const response = await api.post<{ playlist: Playlist }>('/user/playlists', {
          name: name.trim(),
          description: description.trim()
        });
        const newPlaylist = response.data.playlist;
        await indexedDB.savePlaylists([newPlaylist]);
      } else {
        const playlistId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const localPlaylist: Playlist = {
          id: playlistId,
          userId: user?.uid || 'offline',
          name: name.trim(),
          description: description.trim(),
          imageUrl: '',
          trackCount: 0,
          isPublic: false,
          owner: {
            id: user?.uid || 'offline',
            name: user?.name || 'Local User'
          },
          spotifyUrl: '',
          lastSyncedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        await indexedDB.savePlaylists([localPlaylist]);
      }
      
      await loadLibraryData();
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  const userDisplayName = user?.name || 'Sarthak Kharche';
  const customPlaylists = playlists.filter((p) => p.id !== 'custom_liked_songs');

  const filteredPlaylists = customPlaylists.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-32 px-4 py-4 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 rounded-full overflow-hidden border border-white/20 hover:scale-105 transition-transform"
          >
            {user?.picture ? (
              <img src={user.picture} alt={userDisplayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-spotify-green/20 text-spotify-green flex items-center justify-center font-bold text-sm">
                {userDisplayName.charAt(0)}
              </div>
            )}
          </button>
          <h1 className="text-2xl font-bold text-white tracking-tight">Your Library</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSearchInput(!showSearchInput)}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title="Search Library"
          >
            <FiSearch size={20} />
          </button>
          <button
            onClick={handleCreatePlaylist}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title="Create Playlist"
          >
            <FiPlus size={24} />
          </button>
        </div>
      </div>

      {/* Optional Search Input */}
      {showSearchInput && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search in Your Library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-spotify-green"
          />
        </div>
      )}

      {/* Filter Chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
        <span className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold select-none cursor-pointer">
          Playlists
        </span>
      </div>

      {/* Recents Sub-header & View Toggle */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white/70 tracking-wide uppercase">
          <FiArrowDown size={14} />
          <span>Recents</span>
        </div>
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          className="p-1 text-white/60 hover:text-white transition-colors"
          title={viewMode === 'list' ? 'Grid View' : 'List View'}
        >
          {viewMode === 'list' ? <FiGrid size={18} /> : <FiList size={18} />}
        </button>
      </div>

      {/* Library Content Items */}
      {viewMode === 'list' ? (
        <div className="space-y-1">
          {/* Liked Songs Entry */}
          <div
            onClick={() => navigate('/playlist/custom_liked_songs')}
            className="flex items-center gap-4 p-2.5 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
              <FiHeart size={26} className="text-white fill-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white truncate">Liked Songs</h3>
              <p className="text-xs text-white/60 truncate flex items-center gap-1 mt-0.5">
                <span className="text-spotify-green font-bold">
                  📌 Playlist
                </span>
                <span>• {likedSongCount} songs</span>
              </p>
            </div>
          </div>

          {/* User Playlists */}
          {filteredPlaylists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => navigate(`/playlist/${playlist.id}`)}
              className="flex items-center gap-4 p-2.5 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer group"
            >
              {playlist.imageUrl ? (
                <img
                  src={playlist.imageUrl}
                  alt={playlist.name}
                  className="w-16 h-16 rounded-xl object-cover shadow-md flex-shrink-0 border border-white/10 group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <FiMusic size={24} className="text-white/40" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-white truncate">{playlist.name}</h3>
                <p className="text-xs text-white/60 truncate mt-0.5">
                  Playlist • {playlist.owner?.name || userDisplayName}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {/* Liked Songs Card */}
          <div
            onClick={() => navigate('/playlist/custom_liked_songs')}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer group flex flex-col gap-3"
          >
            <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <FiHeart size={36} className="text-white fill-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white truncate">Liked Songs</h3>
              <p className="text-xs text-spotify-green font-semibold mt-0.5">
                Playlist • {likedSongCount} songs
              </p>
            </div>
          </div>

          {/* User Playlist Cards */}
          {filteredPlaylists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => navigate(`/playlist/${playlist.id}`)}
              className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer group flex flex-col gap-3"
            >
              {playlist.imageUrl ? (
                <img
                  src={playlist.imageUrl}
                  alt={playlist.name}
                  className="w-full aspect-square rounded-xl object-cover shadow-lg border border-white/10 group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                  <FiMusic size={32} className="text-white/40" />
                </div>
              )}
              <div>
                <h3 className="text-sm font-bold text-white truncate">{playlist.name}</h3>
                <p className="text-xs text-white/50 truncate mt-0.5">
                  Playlist • {playlist.owner?.name || userDisplayName}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
