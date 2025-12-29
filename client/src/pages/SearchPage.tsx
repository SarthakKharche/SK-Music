import { useState, useCallback, useEffect } from 'react';
import { FiSearch, FiPlay, FiClock } from 'react-icons/fi';
import { usePlayer } from '../contexts/PlayerContext';
import api from '../utils/api';
import { formatDuration } from '../utils/helpers';
import type { Track } from '../types';

interface SearchTrack {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    imageUrl: string | null;
    releaseDate: string | null;
  };
  durationMs: number;
  explicit: boolean;
  isrc: string | null;
  spotifyUrl: string;
  previewUrl: string | null;
}

interface BrowseCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

const browseCategories: BrowseCategory[] = [
  { id: 'pop', name: 'Pop', color: '#8D67AB' },
  { id: 'hip-hop', name: 'Hip-Hop', color: '#BA5D07' },
  { id: 'rock', name: 'Rock', color: '#E61E32' },
  { id: 'latin', name: 'Latin', color: '#E13300' },
  { id: 'indie', name: 'Indie', color: '#608108' },
  { id: 'electronic', name: 'Electronic', color: '#0D73EC' },
  { id: 'r-n-b', name: 'R&B', color: '#DC148C' },
  { id: 'jazz', name: 'Jazz', color: '#1E3264' },
  { id: 'classical', name: 'Classical', color: '#7358FF' },
  { id: 'country', name: 'Country', color: '#E8115B' },
  { id: 'metal', name: 'Metal', color: '#503750' },
  { id: 'folk', name: 'Folk & Acoustic', color: '#477D95' },
  { id: 'soul', name: 'Soul', color: '#C9B9A7' },
  { id: 'chill', name: 'Chill', color: '#549AAB' },
  { id: 'focus', name: 'Focus', color: '#5179A1' },
  { id: 'workout', name: 'Workout', color: '#E91429' },
];

const SearchPage: React.FC = () => {
  const { playTrack, currentTrack } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [topResult, setTopResult] = useState<SearchTrack | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sk-music-recent-searches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const saveRecentSearch = (searchQuery: string) => {
    const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 8);
    setRecentSearches(updated);
    localStorage.setItem('sk-music-recent-searches', JSON.stringify(updated));
  };

  const searchTracks = useCallback(async (searchQuery: string, searchOffset: number = 0) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTopResult(null);
      setSearched(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ tracks: SearchTrack[]; total: number; hasMore: boolean }>(
        `/spotify/search?q=${encodeURIComponent(searchQuery)}&limit=20&offset=${searchOffset}`
      );

      if (searchOffset === 0) {
        setResults(response.data.tracks);
        setTopResult(response.data.tracks[0] || null);
        saveRecentSearch(searchQuery);
      } else {
        setResults((prev) => [...prev, ...response.data.tracks]);
      }
      setTotal(response.data.total);
      setHasMore(response.data.hasMore);
      setOffset(searchOffset + 20);
      setSearched(true);
    } catch (err: any) {
      console.error('Search failed:', err);
      setResults([]);
      setSearched(true);
      
      // Check for specific error types
      if (err.response?.status === 401) {
        setError('Please log in to search');
      } else if (err.response?.status === 403 || err.response?.data?.error?.includes('Spotify')) {
        setError('Please connect your Spotify account to search');
      } else {
        setError('Search failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [recentSearches]);

  // Debounced auto-search as user types
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setTopResult(null);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      setOffset(0);
      searchTracks(query, 0);
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setOffset(0);
      searchTracks(query, 0);
    }
  };

  const handleCategorySearch = (category: BrowseCategory) => {
    setQuery(category.name);
    // The useEffect will trigger the search automatically
  };

  const handleLoadMore = () => {
    searchTracks(query, offset);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setTopResult(null);
  };

  const handlePlayTrack = async (searchTrack: SearchTrack) => {
    const track: Track = {
      id: searchTrack.id,
      playlistId: 'search',
      userId: '',
      name: searchTrack.name,
      artists: searchTrack.artists,
      album: {
        id: searchTrack.album.id,
        name: searchTrack.album.name,
        imageUrl: searchTrack.album.imageUrl || undefined,
        releaseDate: searchTrack.album.releaseDate || undefined,
      },
      durationMs: searchTrack.durationMs,
      explicit: searchTrack.explicit,
      isrc: searchTrack.isrc || undefined,
      spotifyUrl: searchTrack.spotifyUrl,
      previewUrl: searchTrack.previewUrl || undefined,
      isOfflinePreferred: false,
      addedAt: new Date().toISOString(),
    };

    const allTracks = results.map((t) => ({
      id: t.id,
      playlistId: 'search',
      userId: '',
      name: t.name,
      artists: t.artists,
      album: {
        id: t.album.id,
        name: t.album.name,
        imageUrl: t.album.imageUrl || undefined,
        releaseDate: t.album.releaseDate || undefined,
      },
      durationMs: t.durationMs,
      explicit: t.explicit,
      isrc: t.isrc || undefined,
      spotifyUrl: t.spotifyUrl,
      previewUrl: t.previewUrl || undefined,
      isOfflinePreferred: false,
      addedAt: new Date().toISOString(),
    }));

    await playTrack(track, allTracks);
  };

  return (
    <div className="p-6 pb-32">
      {/* Search Bar - Spotify Style */}
      <form onSubmit={handleSearch} className="mb-8 sticky top-0 z-10 pt-2 pb-4 bg-gradient-to-b from-spotify-black via-spotify-black to-transparent">
        <div className="relative max-w-md">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-spotify-black text-lg" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to listen to?"
            className="w-full bg-white text-spotify-black pl-12 pr-10 py-3 rounded-full 
                       focus:outline-none focus:ring-2 focus:ring-white
                       placeholder:text-gray-500 font-medium text-sm"
          />
          {query && !loading && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-spotify-black hover:text-gray-600"
            >
              ✕
            </button>
          )}
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-spotify-black border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </form>

      {/* Error State */}
      {error && (
        <div className="text-center py-8 mb-8">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !searched && query && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
        </div>
      )}

      {/* Results */}
      {searched && results.length > 0 && !error && (
        <div className="mb-8">
          {/* Top Result + Songs Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 mb-8">
            {/* Top Result */}
            {topResult && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-4">Top result</h2>
                <div 
                  className="bg-spotify-gray hover:bg-spotify-dark p-5 rounded-lg cursor-pointer group transition-all relative"
                  onClick={() => handlePlayTrack(topResult)}
                >
                  <img
                    src={topResult.album.imageUrl || '/placeholder-album.png'}
                    alt={topResult.album.name}
                    className="w-24 h-24 rounded shadow-lg mb-4"
                  />
                  <h3 className="text-3xl font-bold text-white mb-2 truncate">{topResult.name}</h3>
                  <p className="text-spotify-lightgray">
                    <span className="text-xs bg-black/30 px-2 py-1 rounded-full mr-2">Song</span>
                    {topResult.artists.map(a => a.name).join(', ')}
                  </p>
                  
                  {/* Play Button */}
                  <button
                    className="absolute bottom-5 right-5 w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 hover:scale-105"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayTrack(topResult);
                    }}
                  >
                    <FiPlay className="text-black text-xl ml-1" fill="black" />
                  </button>
                </div>
              </div>
            )}

            {/* Songs */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Songs</h2>
              <div className="bg-transparent">
                {results.slice(0, 4).map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  
                  return (
                    <div
                      key={`${track.id}-${index}`}
                      className="flex items-center gap-4 p-2 rounded-md hover:bg-spotify-gray group cursor-pointer transition-colors"
                      onClick={() => handlePlayTrack(track)}
                    >
                      {/* Album Art with Play Overlay */}
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <img
                          src={track.album.imageUrl || '/placeholder-album.png'}
                          alt={track.album.name}
                          className="w-full h-full object-cover rounded"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                          <FiPlay className="text-white" fill="white" size={14} />
                        </div>
                      </div>

                      {/* Track Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${isCurrentTrack ? 'text-spotify-green' : 'text-white'}`}>
                          {track.name}
                        </p>
                        <p className="text-spotify-lightgray text-sm truncate">
                          {track.explicit && (
                            <span className="inline-flex items-center justify-center w-4 h-4 bg-spotify-lightgray/30 text-spotify-lightgray text-[10px] rounded mr-1">E</span>
                          )}
                          {track.artists.map((a) => a.name).join(', ')}
                        </p>
                      </div>

                      {/* Duration */}
                      <span className="text-spotify-lightgray text-sm">
                        {formatDuration(track.durationMs)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* All Results Table */}
          {results.length > 4 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">All results</h2>
              
              {/* Table Header */}
              <div className="grid grid-cols-[48px_1fr_1fr_80px] gap-4 px-4 py-2 text-spotify-lightgray text-sm border-b border-spotify-lightgray/20 sticky top-20 bg-spotify-black">
                <div>#</div>
                <div>Title</div>
                <div>Album</div>
                <div className="text-right"><FiClock /></div>
              </div>

              {/* Tracks */}
              <div className="space-y-1 mt-2">
                {results.slice(4).map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;

                  return (
                    <div
                      key={`${track.id}-full-${index}`}
                      onClick={() => handlePlayTrack(track)}
                      className={`grid grid-cols-[48px_1fr_1fr_80px] gap-4 px-4 py-2 rounded-md group cursor-pointer transition-colors hover:bg-spotify-gray`}
                    >
                      {/* Index / Play Button */}
                      <div className="flex items-center justify-center">
                        <span className="group-hover:hidden text-spotify-lightgray">{index + 5}</span>
                        <FiPlay className="hidden group-hover:block text-white" size={14} />
                      </div>

                      {/* Track Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={track.album.imageUrl || '/placeholder-album.png'}
                          alt={track.album.name}
                          className="w-10 h-10 rounded shadow"
                        />
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${isCurrentTrack ? 'text-spotify-green' : 'text-white'}`}>
                            {track.name}
                          </p>
                          <p className="text-sm text-spotify-lightgray truncate">
                            {track.explicit && (
                              <span className="inline-flex items-center justify-center w-4 h-4 bg-spotify-lightgray/30 text-spotify-lightgray text-[10px] rounded mr-1">E</span>
                            )}
                            {track.artists.map((a) => a.name).join(', ')}
                          </p>
                        </div>
                      </div>

                      {/* Album */}
                      <div className="flex items-center text-spotify-lightgray text-sm truncate hover:underline">
                        {track.album.name}
                      </div>

                      {/* Duration */}
                      <div className="flex items-center justify-end text-spotify-lightgray text-sm">
                        {formatDuration(track.durationMs)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center mt-8">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="bg-transparent text-white border border-spotify-lightgray/40 px-8 py-3 rounded-full 
                           hover:border-white hover:scale-105 transition-all disabled:opacity-50 font-semibold"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* No Results */}
      {searched && results.length === 0 && !loading && (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-white mb-2">No results found for "{query}"</h2>
          <p className="text-spotify-lightgray">
            Please make sure your words are spelled correctly, or use fewer or different keywords.
          </p>
        </div>
      )}

      {/* Browse Categories - Shown when not searching */}
      {!searched && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Browse all</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {browseCategories.map((category) => (
              <div
                key={category.id}
                onClick={() => handleCategorySearch(category)}
                className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group transform hover:scale-105 transition-transform"
                style={{ backgroundColor: category.color }}
              >
                <div className="absolute inset-0 p-4">
                  <h3 className="text-white font-bold text-xl">{category.name}</h3>
                </div>
                {/* Decorative element */}
                <div className="absolute -bottom-2 -right-4 w-24 h-24 bg-black/10 rounded transform rotate-25"></div>
              </div>
            ))}
          </div>

          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold text-white mb-6">Recent searches</h2>
              <div className="flex flex-wrap gap-3">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setQuery(search);
                      searchTracks(search, 0);
                    }}
                    className="bg-spotify-gray hover:bg-spotify-dark text-white px-4 py-2 rounded-full transition-colors"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && results.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
