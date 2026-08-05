import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useMadeForYou } from '../contexts/MadeForYouContext';
import { indexedDB } from '../services/indexedDB';
import api from '../utils/api';
import { FiMusic, FiPlay, FiClock, FiZap, FiHeadphones, FiRefreshCw } from 'react-icons/fi';
import { SiSpotify } from 'react-icons/si';
import { MdCategory } from 'react-icons/md';
import type { Playlist, Track, MadeForYouPlaylist, MadeForYouTrackEntry } from '../types';
import { useNavigate } from 'react-router-dom';

interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  trackCount: number;
  owner?: {
    id: string;
    name: string;
  };
  isSpotifyPlaylist?: boolean;
  isTrack?: boolean; // For search results that are tracks
  artists?: Array<{ id: string; name: string }>;
  album?: { id: string; name: string; imageUrl?: string };
}

interface SpotifyCategory {
  id: string;
  name: string;
  icons: Array<{ url: string }>;
}

interface CategorySection {
  category: SpotifyCategory;
  playlists: SpotifyPlaylist[];
}

/** Convert a MadeForYouTrackEntry to Track for the player */
function mfyEntryToTrack(entry: MadeForYouTrackEntry, playlistId: string, userId: string): Track {
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

const HomePage: React.FC = () => {
  const { user, connectSpotify } = useAuth();
  const { syncPlaylists, isOffline } = useOffline();
  const { playTrack } = usePlayer();
  const {
    playlists: mfyPlaylists,
    loading: mfyLoading,
    hasImported: mfyImported,
    importFromSpotify: mfyImport,
    recordEvent,
  } = useMadeForYou();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [featuredPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [categorySections, setCategorySections] = useState<CategorySection[]>([]);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [featuredMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [mfyRegenerating, setMfyRegenerating] = useState(false);
  const navigate = useNavigate();
  const hasLoadedSections = useRef(false);
  const mfyImportAttempted = useRef(false);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Get background gradient based on time of day
  const getGradient = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'from-amber-900/80'; // Morning - warm amber
    if (hour >= 12 && hour < 17) return 'from-blue-900/80'; // Afternoon - blue
    if (hour >= 17 && hour < 20) return 'from-orange-900/80'; // Evening - orange/sunset
    return 'from-indigo-900/80'; // Night - deep indigo
  };

  useEffect(() => {
    // Load cached sections immediately
    const cached = sessionStorage.getItem('categorySections');
    if (cached) {
      try {
        setCategorySections(JSON.parse(cached));
      } catch (err) {
        console.error('Failed to parse cached sections:', err);
      }
    }
    
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    try {
      // Load playlists from IndexedDB first (fast, local)
      const cachedPlaylists = await indexedDB.getPlaylists();
      setPlaylists(cachedPlaylists);

      // Load recent tracks
      const allTracks: Track[] = [];
      for (const playlist of cachedPlaylists.slice(0, 3)) {
        const tracks = await indexedDB.getTracksByPlaylist(playlist.id);
        allTracks.push(...tracks.slice(0, 5));
      }
      setRecentTracks(allTracks.slice(0, 6));
    } catch (error) {
      console.error('Failed to load cached data:', error);
    }
    
    // Stop loading - show UI immediately
    setLoading(false);

    // Load online data in background if connected
    if (!isOffline && user?.spotifyConnected) {
      // Sync playlists in background
      syncPlaylists()
        .then(() => indexedDB.getPlaylists())
        .then(setPlaylists)
        .catch(err => console.error('Failed to sync playlists:', err));

      // Load curated sections if not already loaded
      if (!hasLoadedSections.current || categorySections.length === 0) {
        loadCuratedSections();
        hasLoadedSections.current = true;
      }
    }
  };

  const loadCuratedSections = async () => {
    console.log('[HomePage] Loading popular playlists via search');

    try {
      // Search for popular playlists by genre/type
      const queries = [
        { name: '🔥 Latest Bollywood Songs', query: 'Latest Bollywood 2024 2025' },
        { name: '🎵 Bollywood Hits', query: 'Bollywood hits' },
        { name: '🎸 Indie India', query: 'Indie India' },
        { name: '🎹 Chill Vibes', query: 'Chill vibes' },
        { name: '🏆 Top Hits India', query: 'Top hits India 2024' },
      ];

      const sections: CategorySection[] = [];

      for (const q of queries) {
        try {
          const response = await api.get<{ playlists: SpotifyPlaylist[] }>(
            `/spotify/search/playlists?q=${encodeURIComponent(q.query)}&limit=12`
          );
          
          if (response.data.playlists && response.data.playlists.length > 0) {
            sections.push({
              category: { id: q.query.toLowerCase().replace(/\s+/g, '-'), name: q.name, icons: [] },
              playlists: response.data.playlists.map((p) => ({ ...p, isSpotifyPlaylist: true })),
            });
          }
        } catch (err) {
          console.error(`Failed to search playlists for "${q.query}":`, err);
        }
      }

      console.log('[HomePage] Sections loaded:', sections.map(s => `${s.category.name} (${s.playlists.length})`));
      setCategorySections(sections);
      
      // Cache to sessionStorage
      try {
        sessionStorage.setItem('categorySections', JSON.stringify(sections));
      } catch (err) {
        console.error('Failed to cache sections:', err);
      }
    } catch (error: any) {
      if (error?.response?.status === 429) {
        console.log('[HomePage] Rate limited, will retry later');
      } else {
        console.error('Failed to load curated sections:', error);
      }
    }
  };

  const handleConnectSpotify = async () => {
    try {
      await connectSpotify();
    } catch (error) {
      console.error('Failed to connect Spotify:', error);
    }
  };

  // Auto-import Made For You playlists on first visit when Spotify is connected
  useEffect(() => {
    if (!user?.spotifyConnected || mfyImportAttempted.current || isOffline || mfyLoading) return;
    if (!mfyImported) {
      mfyImportAttempted.current = true;
      // Always use skipIfExists=true on auto-import — never auto-delete existing playlists
      mfyImport(true).catch((err) => console.error('[MFY] Auto-import failed:', err));
    }
  }, [user?.spotifyConnected, mfyImported, isOffline, mfyLoading, mfyImport]);

  const handleMfyRegenerate = async () => {
    setMfyRegenerating(true);
    try {
      // Force re-import from Spotify first for freshest data, then regenerate
      await mfyImport(false);
    } finally { setMfyRegenerating(false); }
  };

  const handlePlayMfyPlaylist = async (playlist: MadeForYouPlaylist, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playlist.tracks.length === 0) return;
    const first = playlist.tracks[0];
    const track = mfyEntryToTrack(first, playlist.id, playlist.userId);
    const queue = playlist.tracks.map((t) => mfyEntryToTrack(t, playlist.id, playlist.userId));
    recordEvent(track, 'play', 0);
    await playTrack(track, queue);
  };

  const handlePlayPlaylist = async (playlist: Playlist | SpotifyPlaylist, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if it's a Spotify playlist that needs to be fetched
    if ('isSpotifyPlaylist' in playlist && playlist.isSpotifyPlaylist) {
      navigate(`/spotify-playlist/${playlist.id}`);
      return;
    }

    const tracks = await indexedDB.getTracksByPlaylist(playlist.id);
    if (tracks.length > 0) {
      await playTrack(tracks[0], tracks);
    }
  };

  const handlePlaylistClick = (playlist: Playlist | SpotifyPlaylist) => {
    // If it's a track from search results, we can't navigate to it as a playlist
    if ('isTrack' in playlist && playlist.isTrack) {
      // For tracks, just log for now - we'd need to play it
      console.log('Track clicked:', playlist.name);
      return;
    }
    if ('isSpotifyPlaylist' in playlist && playlist.isSpotifyPlaylist) {
      navigate(`/spotify-playlist/${playlist.id}`);
    } else {
      navigate(`/playlist/${playlist.id}`);
    }
  };

  // Playlist Card Component
  const PlaylistCard = ({ playlist, keyPrefix = '' }: { playlist: Playlist | SpotifyPlaylist; keyPrefix?: string }) => (
    <div
      key={`${keyPrefix}-${playlist.id}`}
      onClick={() => handlePlaylistClick(playlist)}
      className="group bg-[#181818] hover:bg-[#282828] rounded-md p-4 cursor-pointer transition-all duration-300"
    >
      {/* Album Art with Play Button Overlay */}
      <div className="relative mb-4">
        {playlist.imageUrl ? (
          <img
            src={playlist.imageUrl}
            alt={playlist.name}
            className="w-full aspect-square object-cover rounded-md shadow-lg"
          />
        ) : (
          <div className="w-full aspect-square bg-spotify-gray rounded-md flex items-center justify-center shadow-lg">
            <FiMusic className="text-spotify-lightgray text-4xl" />
          </div>
        )}
        
        {/* Play Button */}
        <button
          onClick={(e) => handlePlayPlaylist(playlist, e)}
          className="absolute right-2 bottom-2 w-12 h-12 bg-spotify-green rounded-full 
                     flex items-center justify-center shadow-xl
                     opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0
                     transition-all duration-300 hover:scale-105"
        >
          <FiPlay className="text-black ml-1" size={24} />
        </button>
      </div>

      {/* Playlist Info */}
      <h3 className="text-white font-bold truncate mb-1">
        {playlist.name}
      </h3>
      <p className="text-spotify-lightgray text-sm line-clamp-2">
        {playlist.trackCount} tracks {playlist.owner?.name ? `• ${playlist.owner.name}` : ''}
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-b from-[#1e3264] to-spotify-black">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
      </div>
    );
  }

  if (!user?.spotifyConnected) {
    return (
      <div className="flex items-center justify-center h-full p-8 bg-gradient-to-b from-[#1e3264] to-spotify-black">
        <div className="text-center max-w-md">
          <SiSpotify className="text-spotify-green text-6xl mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Connect Your Spotify Account
          </h2>
          <p className="text-spotify-lightgray mb-6">
            Connect your Spotify account to sync your playlists and start listening.
          </p>
          <button 
            onClick={handleConnectSpotify} 
            className="bg-spotify-green text-black font-bold py-3 px-8 rounded-full hover:scale-105 transition-transform"
          >
            <SiSpotify className="inline mr-2" />
            Connect Spotify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full starfield text-white pb-32">
      {/* Header with Greeting */}
      <div className={`p-6 pb-4 bg-gradient-to-b ${getGradient()} to-transparent`}>
        <h1 className="text-3xl font-bold text-white">{getGreeting()}</h1>
      </div>

      {/* Quick Access Grid - Top 6 playlists */}
      {playlists.length > 0 && (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
            {playlists.slice(0, 6).map((playlist) => (
              <div
                key={playlist.id}
                onClick={() => navigate(`/playlist/${playlist.id}`)}
                className="group flex items-center bg-white/10 hover:bg-white/20 rounded-md overflow-hidden cursor-pointer transition-colors"
              >
                {/* Album Art */}
                <div className="w-12 h-12 md:w-20 md:h-20 flex-shrink-0">
                  {playlist.imageUrl ? (
                    <img
                      src={playlist.imageUrl}
                      alt={playlist.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-spotify-gray flex items-center justify-center">
                      <FiMusic className="text-spotify-lightgray" />
                    </div>
                  )}
                </div>
                
                {/* Title & Play Button */}
                <div className="flex-1 flex items-center justify-between px-4 min-w-0">
                  <span className="text-white text-sm font-bold truncate">
                    {playlist.name}
                  </span>
                  <button
                    onClick={(e) => handlePlayPlaylist(playlist, e)}
                    className="w-10 h-10 bg-spotify-green rounded-full flex items-center justify-center 
                               opacity-0 group-hover:opacity-100 transition-all duration-200 
                               shadow-lg hover:scale-105 ml-2 flex-shrink-0"
                  >
                    <FiPlay className="text-black ml-0.5" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Made For You Section ─── */}
      {(mfyPlaylists.length > 0 || mfyLoading) && (
        <section className="px-6 pb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FiZap className="text-purple-400" size={24} />
              <div>
                <h2 className="text-2xl font-bold text-white">Made For You</h2>
                <p className="text-spotify-lightgray text-xs mt-0.5">
                  Initially inspired by Spotify, now personalized by your listening here
                </p>
              </div>
            </div>
            <button
              onClick={handleMfyRegenerate}
              disabled={mfyRegenerating || mfyLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs font-medium transition disabled:opacity-40 border border-white/5"
              title="Refresh recommendations"
            >
              <FiRefreshCw className={mfyRegenerating ? 'animate-spin' : ''} size={13} />
              {mfyRegenerating ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {mfyLoading && mfyPlaylists.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#181818] rounded-md p-4 animate-pulse">
                  <div className="w-full aspect-square bg-white/5 rounded-md mb-4" />
                  <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {mfyPlaylists.map((mfyPl) => (
                <div
                  key={mfyPl.id}
                  onClick={() => navigate(`/made-for-you/${mfyPl.id}`)}
                  className="group bg-[#181818] hover:bg-[#282828] rounded-md p-4 cursor-pointer transition-all duration-300"
                >
                  {/* Cover Art */}
                  <div className="relative mb-4">
                    {mfyPl.imageUrl ? (
                      <img
                        src={mfyPl.imageUrl}
                        alt={mfyPl.displayName}
                        className="w-full aspect-square object-cover rounded-md shadow-lg"
                      />
                    ) : mfyPl.tracks.length > 0 ? (
                      /* Mosaic of album arts from tracks */
                      <div className="w-full aspect-square rounded-md shadow-lg overflow-hidden grid grid-cols-2 grid-rows-2">
                        {(() => {
                          // Get up to 4 unique album images
                          const seen = new Set<string>();
                          const imgs: string[] = [];
                          for (const t of mfyPl.tracks) {
                            const url = t.album?.imageUrl;
                            if (url && !seen.has(url)) {
                              seen.add(url);
                              imgs.push(url);
                              if (imgs.length >= 4) break;
                            }
                          }
                          // Fill to 4 by repeating
                          while (imgs.length < 4 && imgs.length > 0) {
                            imgs.push(imgs[imgs.length % imgs.length]);
                          }
                          return imgs.map((url, i) => (
                            <img key={i} src={url} alt="" className="w-full h-full object-cover" />
                          ));
                        })()}
                      </div>
                    ) : (
                      <div className={`w-full aspect-square rounded-md flex items-center justify-center shadow-lg ${
                        mfyPl.type === 'discover_weekly'
                          ? 'bg-gradient-to-br from-indigo-600/60 to-purple-800/60'
                          : 'bg-gradient-to-br from-emerald-600/60 to-teal-800/60'
                      }`}>
                        {mfyPl.type === 'discover_weekly' ? (
                          <FiZap className="text-white/60" size={40} />
                        ) : (
                          <FiHeadphones className="text-white/60" size={40} />
                        )}
                      </div>
                    )}

                    {/* Play Button */}
                    <button
                      onClick={(e) => handlePlayMfyPlaylist(mfyPl, e)}
                      className="absolute right-2 bottom-2 w-12 h-12 bg-spotify-green rounded-full
                                 flex items-center justify-center shadow-xl
                                 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0
                                 transition-all duration-300 hover:scale-105"
                    >
                      <FiPlay className="text-black ml-1" size={24} />
                    </button>

                    {/* Source Badge */}
                    <span className={`absolute top-2 left-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full backdrop-blur-sm font-semibold ${
                      mfyPl.source === 'spotify_seed'
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {mfyPl.source === 'spotify_seed' ? 'Seed' : 'For You'}
                    </span>
                  </div>

                  {/* Info */}
                  <h3 className="text-white font-bold truncate mb-1">
                    {mfyPl.displayName}
                  </h3>
                  <p className="text-spotify-lightgray text-sm line-clamp-2">
                    {mfyPl.tracks.length} tracks
                    {mfyPl.tracks.length > 0 && ` · ${mfyPl.tracks.slice(0, 3).map((t) => t.artists[0]?.name).filter(Boolean).join(', ')}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Featured Playlists from Spotify */}
      {featuredPlaylists.length > 0 && (
        <section className="px-6 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white hover:underline cursor-pointer">
              {featuredMessage || 'Popular Playlists'}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {featuredPlaylists.map((playlist) => (
              <PlaylistCard key={`featured-${playlist.id}`} playlist={playlist} keyPrefix="featured" />
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Category Sections from Spotify Browse API */}
      {categorySections.map((section) => (
        <section key={section.category.id} className="px-6 pb-8">
          <div className="flex items-center gap-3 mb-4">
            {section.category.icons?.[0]?.url ? (
              <img 
                src={section.category.icons[0].url} 
                alt={section.category.name}
                className="w-7 h-7 rounded"
              />
            ) : (
              <MdCategory className="text-spotify-green" size={28} />
            )}
            <h2 className="text-2xl font-bold text-white">{section.category.name}</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {section.playlists.map((playlist) => (
              <PlaylistCard 
                key={`${section.category.id}-${playlist.id}`} 
                playlist={playlist} 
                keyPrefix={section.category.id} 
              />
            ))}
          </div>
        </section>
      ))}

      {/* Your Playlists Section */}
      {playlists.length > 0 && (
        <section className="px-6 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white hover:underline cursor-pointer">
              Your Library
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {playlists.map((playlist) => (
              <PlaylistCard key={`library-${playlist.id}`} playlist={playlist} keyPrefix="library" />
            ))}
          </div>
        </section>
      )}

      {/* Recently Played / Jump Back In */}
      {recentTracks.length > 0 && (
        <section className="px-6 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Jump back in</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {recentTracks.map((track) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, recentTracks)}
                className="group bg-[#181818] hover:bg-[#282828] rounded-md p-4 cursor-pointer transition-all duration-300"
              >
                {/* Album Art */}
                <div className="relative mb-4">
                  {track.album.imageUrl ? (
                    <img
                      src={track.album.imageUrl}
                      alt={track.album.name}
                      className="w-full aspect-square object-cover rounded-md shadow-lg"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-spotify-gray rounded-md flex items-center justify-center shadow-lg">
                      <FiMusic className="text-spotify-lightgray text-4xl" />
                    </div>
                  )}
                  
                  {/* Play Button */}
                  <button
                    className="absolute right-2 bottom-2 w-12 h-12 bg-spotify-green rounded-full 
                               flex items-center justify-center shadow-xl
                               opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0
                               transition-all duration-300 hover:scale-105"
                  >
                    <FiPlay className="text-black ml-1" size={24} />
                  </button>
                </div>

                {/* Track Info */}
                <h3 className="text-white font-bold truncate mb-1">
                  {track.name}
                </h3>
                <p className="text-spotify-lightgray text-sm truncate">
                  {track.artists.map((a: { name: string }) => a.name).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {playlists.length === 0 && categorySections.length === 0 && (
        <div className="text-center py-16 px-6">
          <FiClock className="text-spotify-lightgray text-6xl mx-auto mb-4" />
          <h3 className="text-white text-xl font-bold mb-2">No playlists yet</h3>
          <p className="text-spotify-lightgray mb-6">
            Your playlists will appear here after syncing with Spotify
          </p>
          <button 
            onClick={loadData}
            className="bg-white text-black font-bold py-3 px-8 rounded-full hover:scale-105 transition-transform"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default HomePage;
