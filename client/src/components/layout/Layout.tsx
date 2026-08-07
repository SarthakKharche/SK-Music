import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Player from '../player/Player';
import OfflineBanner from './OfflineBanner';
import { Component, ReactNode, ErrorInfo, useState } from 'react';
import { FiMenu, FiMusic } from 'react-icons/fi';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="relative h-screen flex flex-col overflow-hidden text-spotify-white page-surface">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-10" aria-hidden />
      <div className="pointer-events-none absolute -left-32 -top-32 w-80 h-80 rounded-full bg-spotify-green/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-10 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Mobile Top Navigation Header with Hamburger Menu */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0b1020]/90 border-b border-white/10 backdrop-blur-xl z-30">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all"
          aria-label="Toggle menu"
        >
          <FiMenu size={22} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-spotify-green/20 border border-spotify-green/40 flex items-center justify-center">
            <FiMusic className="text-spotify-green text-lg" />
          </div>
          <span className="text-lg font-bold text-white tracking-wide">SK Music</span>
        </div>

        <div className="w-10" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden backdrop-blur-[1px] relative">
        {/* Desktop & Mobile Responsive Sidebar Drawer */}
        <Sidebar
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />

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
    </div>
  );
};

export default Layout;
