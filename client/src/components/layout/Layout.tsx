import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Player from '../player/Player';
import OfflineBanner from './OfflineBanner';
import { Component, ReactNode, ErrorInfo } from 'react';
import { FiMusic, FiHome, FiSearch, FiDownload, FiGrid, FiUser } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';

// Simple error boundary for the player
class PlayerErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Player error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <footer className="h-[90px] bg-[#181818] border-t border-[#282828] px-4 flex items-center justify-center">
          <p className="text-red-400 text-sm">Player error. <button onClick={() => this.setState({ hasError: false })} className="underline">Try again</button></p>
        </footer>
      );
    }
    return this.props.children;
  }
}

const Layout: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative h-screen flex flex-col overflow-hidden text-spotify-white page-surface">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-10" aria-hidden />
      <div className="pointer-events-none absolute -left-32 -top-32 w-80 h-80 rounded-full bg-spotify-green/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-10 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Mobile Top Header with User Profile Photo -> Settings */}
      <div className="md:hidden flex items-center justify-between px-4 py-2.5 bg-[#0b1020]/90 border-b border-white/10 backdrop-blur-xl z-30">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 p-1 rounded-full hover:bg-white/10 active:scale-95 transition-all"
          title="Profile & Settings"
        >
          {user?.picture ? (
            <img
              src={user.picture}
              alt={user.name || 'User'}
              className="w-8 h-8 rounded-full object-cover border border-white/20 shadow-md"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-spotify-green/20 border border-spotify-green/50 flex items-center justify-center text-spotify-green shadow-md">
              <FiUser size={16} />
            </div>
          )}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-spotify-green/20 border border-spotify-green/40 flex items-center justify-center">
            <FiMusic className="text-spotify-green text-sm" />
          </div>
          <span className="text-base font-bold text-white tracking-wide">SK Music</span>
        </div>

        <div className="w-8" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden backdrop-blur-[1px] relative pb-16 md:pb-0">
        {/* Desktop & Mobile Responsive Sidebar Drawer */}
        <Sidebar />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto relative">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent opacity-30" aria-hidden />
          <div className="relative">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Player */}
      <PlayerErrorBoundary>
        <Player />
      </PlayerErrorBoundary>

      {/* SPOTIFY MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070a12]/95 backdrop-blur-2xl border-t border-white/10 px-2 py-1.5 flex items-center justify-around">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
              isActive ? 'text-white font-semibold' : 'text-white/40 hover:text-white/70'
            }`
          }
        >
          <FiHome size={20} />
          <span className="text-[10px] font-medium tracking-tight">Home</span>
        </NavLink>

        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
              isActive ? 'text-white font-semibold' : 'text-white/40 hover:text-white/70'
            }`
          }
        >
          <FiSearch size={20} />
          <span className="text-[10px] font-medium tracking-tight">Search</span>
        </NavLink>

        <NavLink
          to="/youtube-music"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
              isActive ? 'text-red-500 font-semibold' : 'text-white/40 hover:text-white/70'
            }`
          }
        >
          <FiMusic size={20} className="text-red-500" />
          <span className="text-[10px] font-medium tracking-tight">YT Music</span>
        </NavLink>

        <NavLink
          to="/playlist/custom_liked_songs"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
              isActive ? 'text-spotify-green font-semibold' : 'text-white/40 hover:text-white/70'
            }`
          }
        >
          <FiGrid size={20} />
          <span className="text-[10px] font-medium tracking-tight">Your Library</span>
        </NavLink>

        <NavLink
          to="/offline"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
              isActive ? 'text-white font-semibold' : 'text-white/40 hover:text-white/70'
            }`
          }
        >
          <FiDownload size={20} />
          <span className="text-[10px] font-medium tracking-tight">Offline</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default Layout;
