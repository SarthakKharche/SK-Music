/**
 * Made For You — Hub Page
 *
 * Displays all personalised playlists (Discover Weekly, Daily Mixes)
 * with a clear visual separation between Spotify-seeded and app-generated ones.
 *
 * Features:
 *  - Auto-imports from Spotify on first visit (if connected)
 *  - Regenerate button for instant refresh
 *  - Listening stats at-a-glance
 *  - Offline-aware: falls back to cached playlists
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiRefreshCw,
  FiMusic,
  FiTrendingUp,
  FiHeadphones,
  FiSkipForward,
  FiCheckCircle,
  FiZap,
  FiDownloadCloud,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useMadeForYou } from '../contexts/MadeForYouContext';
import type { MadeForYouPlaylist } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hrs} hr ${remaining} min`;
}

function totalDuration(playlist: MadeForYouPlaylist): number {
  return playlist.tracks.reduce((sum, t) => sum + t.durationMs, 0);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Playlist-type to gradient mapping */
const gradients: Record<string, string> = {
  discover_weekly: 'from-indigo-600/40 via-purple-600/30 to-fuchsia-600/20',
  daily_mix: 'from-emerald-600/40 via-teal-600/30 to-cyan-600/20',
};

const icons: Record<string, React.ReactNode> = {
  discover_weekly: <FiZap className="text-purple-300" size={22} />,
  daily_mix: <FiHeadphones className="text-emerald-300" size={22} />,
};

// ─── Component ───────────────────────────────────────────────────────────────

const MadeForYouPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    playlists,
    loading,
    error,
    fetchPlaylists,
    importFromSpotify,
    regenerate,
    hasImported,
    stats,
    fetchStats,
  } = useMadeForYou();

  const [regenerating, setRegenerating] = useState(false);
  const [importing, setImporting] = useState(false);

  // Auto-import on first visit if user has Spotify connected
  useEffect(() => {
    if (user?.spotifyConnected && !hasImported && !importing) {
      setImporting(true);
      importFromSpotify().finally(() => setImporting(false));
    }
  }, [user?.spotifyConnected, hasImported, importFromSpotify, importing]);

  // Fetch stats on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerate();
      await fetchStats();
    } finally {
      setRegenerating(false);
    }
  };

  // Split playlists by type
  const discoverWeekly = playlists.filter((p) => p.type === 'discover_weekly');
  const dailyMixes = playlists.filter((p) => p.type === 'daily_mix');

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      {/* Header */}
      <div className="relative px-6 pt-8 pb-6">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-white">Made For You</h1>
              <p className="text-white/50 text-sm mt-1">
                Playlists personalised by your listening activity
              </p>
            </div>
            <button
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
            >
              <FiRefreshCw className={regenerating ? 'animate-spin' : ''} size={16} />
              {regenerating ? 'Regenerating…' : 'Refresh'}
            </button>
          </div>

          {/* Import banner */}
          {!hasImported && user?.spotifyConnected && (
            <div className="mt-4 p-4 rounded-xl bg-green-900/20 border border-green-500/20">
              <div className="flex items-center gap-3">
                <FiDownloadCloud className="text-green-400" size={20} />
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">
                    {importing ? 'Importing your Spotify playlists…' : 'Import playlists from Spotify'}
                  </p>
                  <p className="text-white/50 text-xs mt-0.5">
                    We'll snapshot your Discover Weekly and Daily Mixes to personalise them here.
                  </p>
                </div>
                {!importing && (
                  <button
                    onClick={() => {
                      setImporting(true);
                      importFromSpotify().finally(() => setImporting(false));
                    }}
                    className="px-4 py-1.5 rounded-full bg-green-500 text-black text-sm font-semibold hover:bg-green-400 transition"
                  >
                    Import
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && playlists.length === 0 && (
        <div className="px-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-6 p-4 rounded-xl bg-red-900/20 border border-red-500/20 text-red-300 text-sm">
          {error}
          <button
            onClick={fetchPlaylists}
            className="ml-3 underline hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Listening Stats Banner */}
      {stats && stats.totalEvents > 0 && (
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<FiHeadphones size={16} />}
              label="Plays"
              value={stats.totalPlays}
              color="text-blue-400"
            />
            <StatCard
              icon={<FiCheckCircle size={16} />}
              label="Completed"
              value={stats.totalCompletes}
              color="text-green-400"
            />
            <StatCard
              icon={<FiSkipForward size={16} />}
              label="Skipped"
              value={stats.totalSkips}
              color="text-amber-400"
            />
            <StatCard
              icon={<FiTrendingUp size={16} />}
              label="Avg. Listen"
              value={`${stats.avgCompletion}%`}
              color="text-purple-400"
            />
          </div>
        </div>
      )}

      {/* Discover Weekly Section */}
      {discoverWeekly.length > 0 && (
        <section className="px-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <FiZap className="text-purple-400" size={18} />
            Discover Weekly
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {discoverWeekly.map((p) => (
              <PlaylistCard
                key={p.id}
                playlist={p}
                onClick={() => navigate(`/made-for-you/${p.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Daily Mixes Section */}
      {dailyMixes.length > 0 && (
        <section className="px-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <FiHeadphones className="text-emerald-400" size={18} />
            Daily Mixes
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dailyMixes.map((p) => (
              <PlaylistCard
                key={p.id}
                playlist={p}
                onClick={() => navigate(`/made-for-you/${p.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Top Artists */}
      {stats && stats.topArtists.length > 0 && (
        <section className="px-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <FiTrendingUp className="text-pink-400" size={18} />
            Your Top Artists
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.topArtists.map((a) => (
              <span
                key={a.name}
                className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/70"
              >
                {a.name}
                <span className="ml-1.5 text-white/40 text-xs">{a.playCount}×</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!loading && playlists.length === 0 && !error && (
        <div className="px-6 py-16 text-center">
          <FiMusic className="mx-auto text-white/20 mb-4" size={48} />
          <h3 className="text-white text-lg font-semibold mb-2">
            No personalised playlists yet
          </h3>
          <p className="text-white/50 text-sm max-w-md mx-auto">
            {user?.spotifyConnected
              ? "We're importing your playlists from Spotify. Check back in a moment."
              : "Connect Spotify in Settings to import your Discover Weekly and Daily Mixes, or just start listening — we'll build playlists from your activity."}
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const PlaylistCard: React.FC<{
  playlist: MadeForYouPlaylist;
  onClick: () => void;
}> = ({ playlist, onClick }) => {
  const gradient = gradients[playlist.type] || gradients.daily_mix;
  const icon = icons[playlist.type] || icons.daily_mix;

  return (
    <button
      onClick={onClick}
      className={`group relative w-full text-left p-5 rounded-2xl bg-gradient-to-br ${gradient} border border-white/5 hover:border-white/15 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_10px_40px_rgba(0,0,0,0.3)] overflow-hidden`}
    >
      {/* Cover images grid */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/10 overflow-hidden flex-shrink-0">
          {playlist.imageUrl ? (
            <img
              src={playlist.imageUrl}
              alt={playlist.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">{icon}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate">{playlist.displayName}</h3>
          <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{playlist.subtitle}</p>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-white/40">
        <span>{playlist.tracks.length} tracks</span>
        <span>·</span>
        <span>{formatDuration(totalDuration(playlist))}</span>
        <span>·</span>
        <span className="capitalize">
          {playlist.source === 'spotify_seed' ? 'From Spotify' : 'Your Data'}
        </span>
        <span>·</span>
        <span>{timeAgo(playlist.generatedAt)}</span>
      </div>

      {/* Source badge */}
      <div className="absolute top-3 right-3">
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            playlist.source === 'spotify_seed'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
          }`}
        >
          {playlist.source === 'spotify_seed' ? 'Seed' : 'AI'}
        </span>
      </div>
    </button>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
    <div className={`flex items-center gap-2 mb-1 ${color}`}>
      {icon}
      <span className="text-xs uppercase tracking-wider text-white/40">{label}</span>
    </div>
    <p className="text-xl font-bold text-white">{value}</p>
  </div>
);

export default MadeForYouPage;
