import { NavLink } from 'react-router-dom';
import { 
  FiHome, 
  FiSearch,
  FiDownload, 
  FiSettings, 
  FiMusic,
  FiLogOut,
  FiPlus,
  FiHeart,
  FiX
} from 'react-icons/fi';

import { useAuth } from '../../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { indexedDB } from '../../services/indexedDB';
import api from '../../utils/api';
import type { Playlist } from '../../types';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { user, logout } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    loadPlaylists();
    window.addEventListener('playlists-updated', loadPlaylists);
    return () => window.removeEventListener('playlists-updated', loadPlaylists);
  }, [user]);

  const loadPlaylists = async () => {
    try {
      // 1. Load local playlists
      const localData = await indexedDB.getPlaylists();
      setPlaylists(localData);
      
      // 2. Fetch custom playlists from server if online and logged in
      if (user && navigator.onLine) {
        const response = await api.get<{ playlists: Playlist[] }>('/user/playlists');
        const serverPlaylists = response.data.playlists;
        
        if (serverPlaylists && serverPlaylists.length > 0) {
          // Save to indexedDB
          await indexedDB.savePlaylists(serverPlaylists);
          // Reload merged playlists from indexedDB to ensure consistency
          const updatedData = await indexedDB.getPlaylists();
          setPlaylists(updatedData);
        }
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
    }
  };

  const handleCreatePlaylist = async () => {
    const name = prompt('Enter playlist name:');
    if (!name || !name.trim()) return;

    try {
      const description = prompt('Enter playlist description (optional):') || '';
      
      if (navigator.onLine && user) {
        // Create on server
        const response = await api.post<{ playlist: Playlist }>('/user/playlists', {
          name: name.trim(),
          description: description.trim()
        });
        
        const newPlaylist = response.data.playlist;
        // Save to IndexedDB
        await indexedDB.savePlaylists([newPlaylist]);
      } else {
        // Offline mode: Create locally
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
      
      // Reload playlists
      await loadPlaylists();
    } catch (error) {
      console.error('Failed to create playlist:', error);
      alert('Failed to create playlist. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity"
        />
      )}

      <aside
        className={`fixed md:relative top-0 bottom-0 left-0 z-50 w-72 md:w-64 bg-[#0b1020]/95 md:bg-[#0b1020]/80 backdrop-blur-2xl border-r border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(29,185,84,0.14),transparent_36%),radial-gradient(circle_at_90%_10%,rgba(94,234,212,0.12),transparent_32%)] blur-3xl" aria-hidden />
        <div className="relative z-10 flex flex-col h-full">
          {/* Logo & Mobile Close Button */}
          <div className="p-6 pb-4 border-b border-white/5 bg-gradient-to-r from-white/5 via-white/0 to-white/0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-spotify-green/15 border border-spotify-green/30 flex items-center justify-center shadow-[0_10px_30px_rgba(29,185,84,0.25)]">
                <FiMusic className="text-spotify-green text-2xl" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white leading-tight">SK Music</h1>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/50">Stream refined</p>
              </div>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="md:hidden p-2 rounded-xl bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all"
                aria-label="Close menu"
              >
                <FiX size={20} />
              </button>
            )}
          </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-white/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            <FiHome size={18} />
            <span className="font-semibold">Home</span>
            <span className="ml-auto h-2 w-2 rounded-full bg-spotify-green/60 opacity-0 group-hover:opacity-100 transition" />
          </NavLink>

          <NavLink
            to="/youtube-music"
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-red-600/20 text-white shadow-[0_10px_30px_rgba(239,68,68,0.15)] border border-red-500/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            <FiMusic size={18} className="text-red-500" />
            <span className="font-semibold text-white/90 group-hover:text-white">YT Music Home</span>
            <span className="ml-auto h-2 w-2 rounded-full bg-red-500 opacity-0 group-hover:opacity-100 transition" />
          </NavLink>

          <NavLink
            to="/search"
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-white/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            <FiSearch size={18} />
            <span className="font-semibold">Search</span>
            <span className="ml-auto h-2 w-2 rounded-full bg-cyan-300/70 opacity-0 group-hover:opacity-100 transition" />
          </NavLink>

          <NavLink
            to="/offline"
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-white/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            <FiDownload size={18} />
            <span className="font-semibold">Offline</span>
            <span className="ml-auto h-2 w-2 rounded-full bg-amber-300/70 opacity-0 group-hover:opacity-100 transition" />
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-white/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            <FiSettings size={18} />
            <span className="font-semibold">Settings</span>
            <span className="ml-auto h-2 w-2 rounded-full bg-purple-300/70 opacity-0 group-hover:opacity-100 transition" />
          </NavLink>

          {/* Divider */}
          <div className="border-t border-white/5 my-4" />

          {/* Playlists */}
          <div className="px-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/50">
            <h3 className="font-semibold">Playlists</h3>
            <button 
              onClick={handleCreatePlaylist}
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
              title="Create Playlist"
            >
              <FiPlus size={14} />
            </button>
          </div>

          <NavLink
            to="/playlist/custom_liked_songs"
            className={({ isActive }) =>
              `group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/20 text-white border border-emerald-500/30 shadow-[0_10px_30px_rgba(16,185,129,0.15)]'
                  : 'text-white/70 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <FiHeart size={12} fill="white" />
            </div>
            <span className="font-semibold text-sm">Liked Songs</span>
          </NavLink>

          {playlists.filter(p => p.id !== 'custom_liked_songs').map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-white/10 text-white border border-white/10'
                    : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <span className="truncate">{playlist.name}</span>
              <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-white/40 group-hover:text-white/60">Play</span>
            </NavLink>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-white/5 bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {user?.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-9 h-9 rounded-xl object-cover border border-white/10"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {user?.name}
                </p>
                <p className="text-[11px] text-white/50">Premium listener</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Logout"
            >
              <FiLogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
