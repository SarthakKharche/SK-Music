import React, { useEffect, useState } from 'react';
import { FiPlay, FiMusic, FiDownload, FiCheck } from 'react-icons/fi';
import api from '../utils/api';
import { usePlayer } from '../contexts/PlayerContext';
import { useOffline } from '../contexts/OfflineContext';
import { audioCacheManager } from '../services/audioCacheManager';
import type { Track } from '../types';

interface YtShelfItem {
  type: 'track' | 'playlist' | 'album';
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
}

interface YtShelf {
  title: string;
  items: YtShelfItem[];
}

const YoutubeMusicHome: React.FC = () => {
  const [shelves, setShelves] = useState<YtShelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack } = usePlayer();
  const { toggleOfflineTrack, syncStatus } = useOffline();
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());

  const mapShelfItemToTrack = (item: YtShelfItem): Track => {
    const fakeTrackId = `yt-${item.id}`;
    return {
      id: fakeTrackId,
      playlistId: 'youtube-home',
      userId: 'youtube',
      name: item.title,
      artists: [{ id: '', name: item.subtitle.split(' • ')[0] || 'Unknown Artist' }],
      album: {
        id: '',
        name: 'YouTube Music Home',
        imageUrl: item.thumbnail,
      },
      durationMs: 0,
      explicit: false,
      spotifyUrl: `https://www.youtube.com/watch?v=${item.id}`,
      isOfflinePreferred: false,
      addedAt: new Date().toISOString(),
    };
  };

  const updateCachedStatus = async (ytShelves: YtShelf[]) => {
    const cached = new Set<string>();
    const tracksToCheck: Track[] = [];
    for (const shelf of ytShelves) {
      for (const item of shelf.items) {
        if (item.type === 'track') {
          tracksToCheck.push(mapShelfItemToTrack(item));
        }
      }
    }
    for (const track of tracksToCheck) {
      const isCached = await audioCacheManager.isTrackCached(track.id);
      if (isCached) {
        cached.add(track.id);
      }
    }
    setCachedTracks(cached);
  };

  const handleToggleOffline = async (e: React.MouseEvent, item: YtShelfItem) => {
    e.stopPropagation();
    const track = mapShelfItemToTrack(item);
    // Crucial: we also need to store the mapping so it plays directly when offline resolved
    localStorage.setItem(`youtube_${track.id}`, item.id);
    await toggleOfflineTrack(track);
    const isCached = await audioCacheManager.isTrackCached(track.id);
    setCachedTracks(prev => {
      const next = new Set(prev);
      if (isCached) {
        next.add(track.id);
      } else {
        next.delete(track.id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (shelves.length > 0) {
      updateCachedStatus(shelves);
    }
  }, [shelves]);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ shelves: YtShelf[] }>('/youtube-music/home');
      setShelves(res.data.shelves);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load YouTube Music home feed. Make sure you logged in with Google and granted YouTube access.');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (item: YtShelfItem) => {
    if (item.type !== 'track') {
      // For albums and playlists, we could support loading them as a queue in the future
      return;
    }

    // Set YouTube ID mapping in localStorage so playback works immediately without scraped searching
    const fakeTrackId = `yt-${item.id}`;
    localStorage.setItem(`youtube_${fakeTrackId}`, item.id);

    const track: Track = {
      id: fakeTrackId,
      playlistId: 'youtube-home',
      userId: 'youtube',
      name: item.title,
      artists: [{ id: '', name: item.subtitle.split(' • ')[0] || 'Unknown Artist' }],
      album: {
        id: '',
        name: 'YouTube Music Home',
        imageUrl: item.thumbnail,
      },
      durationMs: 0,
      explicit: false,
      spotifyUrl: `https://www.youtube.com/watch?v=${item.id}`,
      isOfflinePreferred: false,
      addedAt: new Date().toISOString(),
    };

    await playTrack(track);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-white">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/60 tracking-wider">Retrieving your YouTube Music feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-4 animate-bounce">
          <FiMusic size={24} />
        </div>
        <h3 className="text-xl font-bold mb-2">Could Not Load Home Feed</h3>
        <p className="text-white/60 max-w-md mb-6">{error}</p>
        <button
          onClick={fetchFeed}
          className="px-6 py-2.5 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10 text-white bg-gradient-to-b from-[#0a0f1d] to-[#04060c] pb-24">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-red-600/15 border border-red-500/30 flex items-center justify-center shadow-[0_10px_30px_rgba(239,68,68,0.25)]">
          <FiMusic className="text-red-500 text-2xl" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">YouTube Music Home</h2>
          <p className="text-white/50 text-sm mt-1">Your personalized shelves fetched directly via internal YouTube Music client endpoints.</p>
        </div>
      </div>

      {shelves.map((shelf, shelfIdx) => (
        <div key={shelfIdx} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold tracking-tight text-white/90">{shelf.title}</h3>
          </div>
          
          <div className="relative group/carousel">
            <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {shelf.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handlePlay(item)}
                  className={`flex-shrink-0 w-44 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300 group ${item.type === 'track' ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden shadow-lg mb-4 bg-white/5">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20">
                        <FiMusic size={40} />
                      </div>
                    )}
                    {item.type === 'track' && (
                      <>
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300 hover:bg-red-700">
                            <FiPlay className="ml-1" size={20} fill="white" />
                          </div>
                        </div>
                        {(() => {
                          const fakeTrackId = `yt-${item.id}`;
                          const isCached = cachedTracks.has(fakeTrackId);
                          const status = syncStatus.get(fakeTrackId);
                          return (
                            <button
                              onClick={(e) => handleToggleOffline(e, item)}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 transition-all duration-300 text-white z-10"
                              disabled={status?.status === 'downloading'}
                              title={isCached ? 'Remove from offline' : 'Download for offline'}
                            >
                              {status?.status === 'downloading' ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-red-500"></div>
                              ) : isCached ? (
                                <FiCheck className="text-green-500" size={14} />
                              ) : (
                                <FiDownload size={14} />
                              )}
                            </button>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  <h4 className="font-semibold text-sm truncate text-white" title={item.title}>{item.title}</h4>
                  <p className="text-xs text-white/50 truncate mt-1" title={item.subtitle}>{item.subtitle || 'YouTube Music'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default YoutubeMusicHome;
