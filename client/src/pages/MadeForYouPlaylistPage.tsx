/**
 * Made For You — Playlist Detail Page
 *
 * Shows a single personalised playlist with:
 *  - Header with gradient, cover art, and metadata
 *  - Source badge (Spotify seed vs app-generated)
 *  - Play-all / shuffle buttons
 *  - Track list with recommendation reasons
 *  - Offline cache indicators
 *
 * Follows the visual language of the existing SpotifyPlaylistPage
 * while adding recommendation-specific UX.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiPlay,
  FiShuffle,
  FiClock,
  FiArrowLeft,
  FiDownloadCloud,
  FiRefreshCw,
  FiZap,
  FiHeadphones,
} from 'react-icons/fi';
import { usePlayer } from '../contexts/PlayerContext';
import { useMadeForYou } from '../contexts/MadeForYouContext';
import { indexedDB } from '../services/indexedDB';
import type { MadeForYouPlaylist, MadeForYouTrackEntry, Track } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function msToTime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function totalDuration(tracks: MadeForYouTrackEntry[]): string {
  const totalMs = tracks.reduce((sum, t) => sum + t.durationMs, 0);
  const mins = Math.floor(totalMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hrs} hr ${remaining} min`;
}

const reasonLabels: Record<string, string> = {
  frequently_played: 'You play this often',
  high_completion: 'You always finish this one',
  similar_artist: 'Similar to artists you like',
  genre_match: 'Matches your taste',
  recency_boost: 'Recently discovered',
  seed_track: 'From your Spotify library',
};

const gradientMap: Record<string, string> = {
  discover_weekly: 'from-indigo-900 via-purple-900/80 to-[#0a0e1a]',
  daily_mix: 'from-emerald-900 via-teal-900/80 to-[#0a0e1a]',
};

/** Convert a MadeForYouTrackEntry to the Track interface for the player */
function entryToTrack(entry: MadeForYouTrackEntry, playlistId: string, userId: string): Track {
  return {
    id: entry.trackId,
    playlistId,
    userId,
    name: entry.name,
    artists: entry.artists,
    album: entry.album,
    durationMs: entry.durationMs,
    explicit: entry.explicit,
    isrc: entry.isrc,
    spotifyUrl: entry.spotifyUrl,
    previewUrl: entry.previewUrl,
    isOfflinePreferred: false,
    addedAt: '',
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const MadeForYouPlaylistPage: React.FC = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const { fetchPlaylist, regenerate, recordEvent } = useMadeForYou();

  const [playlist, setPlaylist] = useState<MadeForYouPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);

  // ─── Load playlist ──────────────────────────────────────────────────────

  const loadPlaylist = useCallback(async () => {
    if (!playlistId) return;
    setLoading(true);
    try {
      const data = await fetchPlaylist(playlistId);
      setPlaylist(data);
    } catch (err) {
      console.error('Failed to load playlist:', err);
    } finally {
      setLoading(false);
    }
  }, [playlistId, fetchPlaylist]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  // ─── Check cached status ────────────────────────────────────────────────

  useEffect(() => {
    if (!playlist) return;
    const checkCache = async () => {
      const cached = new Set<string>();
      for (const t of playlist.tracks) {
        const isCached = await indexedDB.isAudioCached(t.trackId);
        if (isCached) cached.add(t.trackId);
      }
      setCachedTracks(cached);
    };
    checkCache();
  }, [playlist]);

  // ─── Playback ───────────────────────────────────────────────────────────

  const handlePlayTrack = async (entry: MadeForYouTrackEntry) => {
    if (!playlist) return;
    const track = entryToTrack(entry, playlist.id, playlist.userId);
    const queue = playlist.tracks.map((t) =>
      entryToTrack(t, playlist.id, playlist.userId),
    );
    recordEvent(track, 'play', 0);
    await playTrack(track, queue);
  };

  const handlePlayAll = async () => {
    if (!playlist || playlist.tracks.length === 0) return;
    await handlePlayTrack(playlist.tracks[0]);
  };

  const handleShuffle = async () => {
    if (!playlist || playlist.tracks.length === 0) return;
    const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
    const track = entryToTrack(shuffled[0], playlist.id, playlist.userId);
    const queue = shuffled.map((t) =>
      entryToTrack(t, playlist.id, playlist.userId),
    );
    recordEvent(track, 'play', 0);
    await playTrack(track, queue);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerate();
      await loadPlaylist();
    } finally {
      setRegenerating(false);
    }
  };

  // ─── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="h-64 bg-gradient-to-b from-white/5 to-transparent animate-pulse" />
        <div className="px-6 space-y-3 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 mb-4">Playlist not found</p>
          <button
            onClick={() => navigate('/made-for-you')}
            className="text-sm text-cyan-400 hover:underline"
          >
            Back to Made For You
          </button>
        </div>
      </div>
    );
  }

  const gradient = gradientMap[playlist.type] || gradientMap.daily_mix;

  return (
    <div className="flex-1 overflow-y-auto pb-32">
      {/* Header */}
      <div className={`relative bg-gradient-to-b ${gradient} px-6 pt-6 pb-8`}>
        <button
          onClick={() => navigate('/made-for-you')}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm mb-6 transition"
        >
          <FiArrowLeft size={16} />
          Made For You
        </button>

        <div className="flex items-end gap-6">
          {/* Cover */}
          <div className="w-44 h-44 rounded-2xl bg-white/10 border border-white/10 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex-shrink-0">
            {playlist.imageUrl ? (
              <img
                src={playlist.imageUrl}
                alt={playlist.displayName}
                className="w-full h-full object-cover"
              />
            ) : playlist.tracks.length > 0 ? (
              <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                {(() => {
                  const seen = new Set<string>();
                  const imgs: string[] = [];
                  for (const t of playlist.tracks) {
                    const url = t.album?.imageUrl;
                    if (url && !seen.has(url)) {
                      seen.add(url);
                      imgs.push(url);
                      if (imgs.length >= 4) break;
                    }
                  }
                  while (imgs.length < 4 && imgs.length > 0) {
                    imgs.push(imgs[imgs.length % imgs.length]);
                  }
                  return imgs.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-full object-cover" />
                  ));
                })()}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {playlist.type === 'discover_weekly' ? (
                  <FiZap className="text-purple-300" size={48} />
                ) : (
                  <FiHeadphones className="text-emerald-300" size={48} />
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  playlist.source === 'spotify_seed'
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                }`}
              >
                {playlist.source === 'spotify_seed'
                  ? 'Spotify Seed'
                  : 'Personalised'}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white truncate">
              {playlist.displayName}
            </h1>
            <p className="text-white/50 text-sm mt-1 line-clamp-2">
              {playlist.subtitle}
            </p>
            <div className="flex items-center gap-3 text-xs text-white/40 mt-3">
              <span>{playlist.tracks.length} tracks</span>
              <span>·</span>
              <span>{totalDuration(playlist.tracks)}</span>
              <span>·</span>
              <span>Updated {new Date(playlist.generatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-green-500 text-black font-semibold text-sm hover:bg-green-400 transition shadow-[0_4px_20px_rgba(29,185,84,0.3)]"
          >
            <FiPlay size={18} />
            Play All
          </button>
          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition border border-white/10"
          >
            <FiShuffle size={16} />
            Shuffle
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition border border-white/10 disabled:opacity-50"
          >
            <FiRefreshCw className={regenerating ? 'animate-spin' : ''} size={16} />
            {regenerating ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Track List */}
      <div className="px-6 mt-4">
        {/* Column headers */}
        <div className="grid grid-cols-[40px_1fr_1fr_120px_60px] gap-4 px-4 py-2 text-xs uppercase tracking-wider text-white/30 border-b border-white/5">
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span>Why</span>
          <span className="text-right">
            <FiClock size={14} />
          </span>
        </div>

        {/* Tracks */}
        {playlist.tracks.map((entry, i) => {
          const isActive = currentTrack?.id === entry.trackId;
          const isCached = cachedTracks.has(entry.trackId);

          return (
            <button
              key={`${entry.trackId}-${i}`}
              onClick={() => handlePlayTrack(entry)}
              className={`group w-full grid grid-cols-[40px_1fr_1fr_120px_60px] gap-4 px-4 py-3 rounded-lg text-left transition-all duration-150 ${
                isActive
                  ? 'bg-white/10 border border-white/10'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              {/* Number / playing indicator */}
              <span className="flex items-center">
                {isActive && isPlaying ? (
                  <span className="flex items-end gap-0.5 h-4">
                    <span className="w-0.5 bg-green-400 animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%' }} />
                    <span className="w-0.5 bg-green-400 animate-[bounce_0.8s_ease-in-out_infinite_0.2s]" style={{ height: '100%' }} />
                    <span className="w-0.5 bg-green-400 animate-[bounce_0.7s_ease-in-out_infinite_0.1s]" style={{ height: '40%' }} />
                  </span>
                ) : (
                  <span className={`text-sm ${isActive ? 'text-green-400' : 'text-white/40'}`}>
                    {i + 1}
                  </span>
                )}
              </span>

              {/* Track info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
                  {entry.album.imageUrl ? (
                    <img
                      src={entry.album.imageUrl}
                      alt={entry.album.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <FiHeadphones size={16} />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isActive ? 'text-green-400' : 'text-white'
                    }`}
                  >
                    {entry.name}
                    {entry.explicit && (
                      <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/40 uppercase">
                        E
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-white/50 truncate">
                    {entry.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>
              </div>

              {/* Album */}
              <div className="flex items-center">
                <span className="text-sm text-white/40 truncate">
                  {entry.album.name}
                </span>
              </div>

              {/* Reason */}
              <div className="flex items-center">
                <span className="text-[11px] text-white/30 truncate">
                  {reasonLabels[entry.reason] || entry.reason}
                </span>
              </div>

              {/* Duration + cache */}
              <div className="flex items-center justify-end gap-2">
                {isCached && (
                  <FiDownloadCloud className="text-green-400/60" size={12} />
                )}
                <span className="text-sm text-white/40">
                  {msToTime(entry.durationMs)}
                </span>
              </div>
            </button>
          );
        })}

        {/* Empty state */}
        {playlist.tracks.length === 0 && (
          <div className="py-16 text-center">
            <FiHeadphones className="mx-auto text-white/20 mb-4" size={40} />
            <p className="text-white/50 text-sm">
              This playlist doesn't have any tracks yet.
            </p>
            <p className="text-white/30 text-xs mt-1">
              Keep listening — we'll personalise this for you soon.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MadeForYouPlaylistPage;
