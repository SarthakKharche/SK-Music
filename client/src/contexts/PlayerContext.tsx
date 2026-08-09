import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { audioCacheManager } from '../services/audioCacheManager';
import { indexedDB } from '../services/indexedDB';
import { recordListeningEvent } from '../services/madeForYouApi';
import api from '../utils/api';
import type { Track, PlayerState } from '../types';

// Extend window to include YouTube IFrame API
declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, config: YouTubePlayerConfig) => YouTubePlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerConfig {
  height?: string;
  width?: string;
  videoId?: string;
  playerVars?: {
    autoplay?: number;
    controls?: number;
    disablekb?: number;
    modestbranding?: number;
    rel?: number;
    showinfo?: number;
    origin?: string;
  };
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YouTubePlayer {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface PlayerContextType extends PlayerState {
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  toggleAutoplay: () => void;
  clearQueue: () => void;
  isYouTube: boolean;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PlayerState>(() => {
    let savedVol = 0.7;
    try {
      const raw = localStorage.getItem('playerVolume');
      if (raw !== null) {
        const val = parseFloat(raw);
        if (!isNaN(val) && val > 0 && val <= 1) savedVol = val;
      }
    } catch {}

    return {
      currentTrack: null,
      isPlaying: false,
      volume: savedVol,
      currentTime: 0,
      duration: 0,
      queue: [],
      queueIndex: -1,
      repeat: 'off',
      shuffle: false,
      autoplay: true,
    };
  });

  const [isYouTube, setIsYouTube] = useState(false);
  const [, setYoutubeReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const lastPauseTimeRef = useRef<number>(0);
  const lastNonZeroVolumeRef = useRef<number>(state.volume > 0 ? state.volume : 0.7);
  const playedHistoryRef = useRef<Set<string>>(new Set());
  const playedSongTitlesRef = useRef<Set<string>>(new Set());
  const stateRef = useRef<PlayerState>(state);

  const normalizeTitle = (title: string): string => {
    return (title || '').toLowerCase().replace(/[\(\)\[\]"'\-_feat\.]/g, '').replace(/\s+/g, ' ').trim();
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * Track listening progress for Made-For-You recommendations.
   * Fires a 'complete' event when >=90% heard, 'skip' on early next/previous.
   */
  const trackingRef = useRef<{ trackId: string; startTime: number; reported: boolean } | null>(null);

  const reportListeningEvent = (track: Track, eventType: 'play' | 'skip' | 'complete', pct: number) => {
    try {
      recordListeningEvent({
        trackId: track.id,
        eventType,
        completionPercentage: Math.round(Math.max(0, Math.min(100, pct))),
        trackName: track.name,
        artistNames: track.artists.map((a) => a.name),
      }).catch(() => { /* fire-and-forget; offline queue handled by context */ });
    } catch { /* ignore */ }
  };

  /** Call when leaving a track (next/prev/new play). Reports skip or complete. */
  const finaliseTracking = () => {
    const info = trackingRef.current;
    if (!info || info.reported) return;
    const prev = state.currentTrack;
    if (!prev || prev.id !== info.trackId) return;

    const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    if (pct >= 90) {
      reportListeningEvent(prev, 'complete', pct);
    } else if (pct > 0) {
      reportListeningEvent(prev, 'skip', pct);
    }
    info.reported = true;
  };

  /**
   * Load YouTube IFrame API
   */
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setYoutubeReady(true);
      };
    } else if (window.YT) {
      setYoutubeReady(true);
    }
  }, []);

  /**
   * Create hidden YouTube player container
   */
  useEffect(() => {
    let container = document.getElementById('youtube-player-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'youtube-player-container';
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      container.innerHTML = '<div id="youtube-player" style="width: 100%; height: 100%;"></div>';
      document.body.appendChild(container);
    }
  }, []);

  useEffect(() => {
    // Keep YouTube player container hidden offscreen for clean audio-only UI
    const container = document.getElementById('youtube-player-container');
    if (container) {
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
    }
  }, [isYouTube]);

  /**
   * Update OS Media Session (Lock Screen & Background Player Notification)
   */
  /**
   * Update OS Media Session (Lock Screen & Background Player Notification)
   */
  const updateMediaSession = (track: Track | null, isPlaying: boolean, durationSec = 0, currentSec = 0) => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) return;

    try {
      const coverUrl = (track.album as any)?.imageUrl || (track.album as any)?.images?.[0]?.url || '';
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name || 'SK Music',
        artist: track.artists ? track.artists.map((a) => a.name).join(', ') : 'SK Music',
        album: track.album?.name || 'SK Music',
        artwork: coverUrl ? [
          { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: coverUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
        ] : [],
      });

      if (isPlaying) {
        navigator.mediaSession.playbackState = 'playing';
      }

      if (durationSec > 0 && 'setPositionState' in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: Math.max(durationSec, 1),
            playbackRate: 1,
            position: Math.min(Math.max(currentSec, 0), durationSec),
          });
        } catch {}
      }
    } catch (e) {
      console.warn('MediaSession error:', e);
    }
  };

  /**
   * Sync MediaSession state whenever track or playing status changes
   */
  useEffect(() => {
    if (state.currentTrack) {
      updateMediaSession(state.currentTrack, state.isPlaying, state.duration, state.currentTime);
    }
  }, [state.currentTrack, state.isPlaying]);

  /**
   * Initialize audio element with background & lockscreen playback permissions
   */
  useEffect(() => {
    const audio = new Audio();
    audio.volume = state.volume;
    
    // Enable background audio playback on mobile browsers when minimized/locked
    (audio as any).playsInline = true;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    
    audio.addEventListener('timeupdate', () => {
      setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
    });

    audio.addEventListener('loadedmetadata', () => {
      setState((prev) => ({ ...prev, duration: audio.duration }));
    });

    audio.addEventListener('ended', () => {
      handleTrackEnd();
    });

    audio.addEventListener('play', () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
      const curTrack = stateRef.current.currentTrack;
      if (curTrack) {
        updateMediaSession(curTrack, true, audio.duration, audio.currentTime);
      }
    });

    audio.addEventListener('pause', () => {
      if (audio.ended) return;
      setState((prev) => ({ ...prev, isPlaying: false }));
      const curTrack = stateRef.current.currentTrack;
      if (curTrack) {
        updateMediaSession(curTrack, false, audio.duration, audio.currentTime);
      }
    });

    audio.addEventListener('error', (e) => {
      // Ignore errors when no source is set (initial mount)
      if (!audio.src || audio.src === window.location.href) return;
      console.error('Audio playback error:', e);
      setState((prev) => ({ ...prev, isPlaying: false }));
    });

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  /**
   * Play a track
   */
  const playTrack = async (track: Track, queue?: Track[]): Promise<void> => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // Immediately update OS MediaSession metadata (Lockscreen / Notification) for instant visual feedback
      updateMediaSession(track, true);

      // Finalise tracking for the previous track before switching
      finaliseTracking();

      // Update current track immediately for UI feedback
      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: false, // Will be set to true once audio starts
      }));

      // Start tracking the new track
      trackingRef.current = { trackId: track.id, startTime: Date.now(), reported: false };
      reportListeningEvent(track, 'play', 0);

      // Add to session listening history & IndexedDB
      playedHistoryRef.current.add(track.id);
      if (track.name) {
        playedSongTitlesRef.current.add(normalizeTitle(track.name));
      }
      indexedDB.addToHistory(track).catch(console.error);

      // Get audio URL (cache-first)
      console.log('Getting audio URL for:', track.name);
      const audioUrl = await audioCacheManager.getAudioUrl(track);
      
      if (!audioUrl) {
        console.error('No audio source available for:', track.name);
        return;
      }

      console.log('Audio URL type:', audioUrl.substring(0, 50));

      // Update queue if provided
      if (queue) {
        const trackIndex = queue.findIndex((t) => t.id === track.id);
        setState((prev) => ({
          ...prev,
          queue,
          queueIndex: trackIndex >= 0 ? trackIndex : 0,
        }));
      }

      // Check if this is a YouTube IFrame fallback URL
      if (audioUrl.startsWith('youtube:')) {
        const videoId = audioUrl.replace('youtube:', '');
        console.log('Playing YouTube video:', videoId);
        setIsYouTube(true);
        
        // Pause HTML audio if playing
        audio.pause();
        audio.src = '';

        // Wait for YouTube API if not ready
        const waitForYouTube = (): Promise<void> => {
          return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
              resolve();
            } else {
              const checkInterval = setInterval(() => {
                if (window.YT && window.YT.Player) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
              // Timeout after 5 seconds
              setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
              }, 5000);
            }
          });
        };

        await waitForYouTube();

        // Initialize or update YouTube player
        if (window.YT && window.YT.Player) {
          console.log('YouTube API ready, creating player');
          
          // Destroy existing player if it exists and has the required methods
          if (youtubePlayerRef.current && typeof youtubePlayerRef.current.loadVideoById === 'function') {
            try {
              youtubePlayerRef.current.loadVideoById(videoId);
              youtubePlayerRef.current.setVolume(state.volume * 100);
            } catch {
              // Player might be in bad state, recreate it
              youtubePlayerRef.current = null;
            }
          } else if (youtubePlayerRef.current) {
            // Player exists but doesn't have methods yet, set to null to recreate
            youtubePlayerRef.current = null;
          }
          
          if (!youtubePlayerRef.current) {
            // Ensure container exists
            let container = document.getElementById('youtube-player');
            if (!container) {
              const wrapper = document.createElement('div');
              wrapper.id = 'youtube-player-container';
              wrapper.style.position = 'fixed';
              wrapper.style.bottom = '100px';
              wrapper.style.right = '24px';
              wrapper.style.width = '240px';
              wrapper.style.height = '135px';
              wrapper.style.zIndex = '9999';
              wrapper.style.borderRadius = '12px';
              wrapper.style.overflow = 'hidden';
              wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
              wrapper.style.border = '1px solid rgba(255,255,255,0.1)';
              wrapper.style.pointerEvents = 'none';
              wrapper.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
              wrapper.style.opacity = '1';
              wrapper.style.transform = 'scale(1)';
              wrapper.style.transformOrigin = 'bottom right';
              wrapper.innerHTML = '<div id="youtube-player" style="width: 100%; height: 100%;"></div>';
              document.body.appendChild(wrapper);
              container = document.getElementById('youtube-player');
            } else {
              // Reset the container for new player
              container.innerHTML = '';
              const newPlayer = document.createElement('div');
              newPlayer.id = 'youtube-player';
              newPlayer.style.width = '100%';
              newPlayer.style.height = '100%';
              container.parentElement?.replaceChild(newPlayer, container);
            }
            
            try {
              youtubePlayerRef.current = new window.YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: {
                  autoplay: 1,
                  controls: 0,
                  disablekb: 1,
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 0,
                },
                events: {
                  onReady: (event) => {
                    event.target.setVolume(state.volume * 100);
                    event.target.playVideo();
                  },
                  onStateChange: (event) => {
                    if (event.data === window.YT.PlayerState.ENDED) {
                      handleTrackEnd();
                    }
                    if (event.data === window.YT.PlayerState.PLAYING) {
                      setState((prev) => ({ ...prev, isPlaying: true }));
                    }
                    if (event.data === window.YT.PlayerState.PAUSED) {
                      setState((prev) => ({ ...prev, isPlaying: false }));
                    }
                  },
                  onError: (event) => {
                    console.error('YouTube player error:', event.data);
                    setState((prev) => ({ ...prev, isPlaying: false }));
                  },
                },
              });
            } catch (ytError) {
              console.error('Failed to create YouTube player:', ytError);
              setState((prev) => ({ ...prev, isPlaying: false }));
              return;
            }
          }

          // Start time update interval for YouTube
          if (timeUpdateIntervalRef.current) {
            clearInterval(timeUpdateIntervalRef.current);
          }
          timeUpdateIntervalRef.current = window.setInterval(() => {
            if (youtubePlayerRef.current && typeof youtubePlayerRef.current.getCurrentTime === 'function') {
              try {
                const currentTime = youtubePlayerRef.current.getCurrentTime();
                const duration = youtubePlayerRef.current.getDuration();
                setState((prev) => ({ ...prev, currentTime, duration }));
              } catch {
                // Player not ready yet, ignore
              }
            }
          }, 1000);
        } else {
          console.error('YouTube API not available');
        }

        setState((prev) => ({
          ...prev,
          currentTrack: track,
          isPlaying: true,
        }));
        return;
      }

      // Regular HTML5 / Cached Blob audio playback
      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
      }));

      try {
        // 1. Get audio URL (IndexedDB offline blob or saavn: query)
        let url = await audioCacheManager.getAudioUrl(track);

        if (!url) {
          console.warn('No audio URL found for track');
          setState((prev) => ({ ...prev, isPlaying: false }));
          return;
        }

        // If saavn-search URL, fetch direct seekable CDN link for instant Byte-Range seeking (<10ms)
        const targetUrl = url;
        if (targetUrl && (targetUrl.includes('/api/audio/saavn-search') || targetUrl.startsWith('saavn:'))) {
          try {
            const fetchUrl = targetUrl.startsWith('saavn:') 
              ? `/api/audio/saavn-search?query=${targetUrl.split(':')[1]}&format=json`
              : `${targetUrl}&format=json`;
            const saavnRes = await fetch(fetchUrl);
            if (saavnRes.ok) {
              const saavnData = await saavnRes.json();
              if (saavnData?.url) {
                url = saavnData.url;
                console.log('[Player] Resolved direct seekable CDN URL:', saavnData.url.substring(0, 50));
              }
            }
          } catch {
            // Fallback to proxy stream URL
          }
        }

        // Play via instant HTML5 Audio
        setIsYouTube(false);
        if (youtubePlayerRef.current && typeof youtubePlayerRef.current.pauseVideo === 'function') {
          try { youtubePlayerRef.current.pauseVideo(); } catch {}
        }

        if (audioRef.current && url) {
          audioRef.current.src = url;
          audioRef.current.load();
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('HTML5 audio play error:', err);
              setState((prev) => ({ ...prev, isPlaying: false }));
            });
          }
        }

        // Set OS MediaSession metadata for background playback & lockscreen controls
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: track.name,
              artist: track.artists?.map((a) => a.name).join(', ') || 'SK Music',
              album: track.album?.name || 'SK Music',
              artwork: [
                { src: track.album?.imageUrl || '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: track.album?.imageUrl || '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              ],
            });
          } catch {}
        }

        setState((prev) => ({
          ...prev,
          currentTrack: track,
          isPlaying: true,
        }));
      } catch (error) {
        console.error('Failed to play track:', error);
        setState((prev) => ({ ...prev, isPlaying: false }));
      }
    } catch (error) {
      console.error('Failed to play track:', error);
      setState((prev) => ({ ...prev, isPlaying: false }));
    }
  };

  /**
   * Pause playback
   */
  const pause = (): void => {
    lastPauseTimeRef.current = Date.now();
    if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.pauseVideo === 'function') {
      try {
        youtubePlayerRef.current.pauseVideo();
      } catch {
        // Player not ready
      }
    } else {
      audioRef.current?.pause();
    }
    setState((prev) => ({ ...prev, isPlaying: false }));
  };

  /**
   * Resume playback
   */
  const resume = (): void => {
    if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.playVideo === 'function') {
      try {
        youtubePlayerRef.current.playVideo();
      } catch {
        // Player not ready
      }
    } else if (audioRef.current) {
      const audio = audioRef.current;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(async (err) => {
          console.warn('[Player] Audio play failed on resume, auto-recovering:', err);
          if (state.currentTrack && audioRef.current) {
            const savedTime = audio.currentTime || state.currentTime;
            const freshUrl = await audioCacheManager.getAudioUrl(state.currentTrack);
            if (freshUrl && audioRef.current) {
              audioRef.current.src = freshUrl;
              audioRef.current.currentTime = savedTime;
              audioRef.current.play().catch((e) => console.error('[Player] Re-play error:', e));
            }
          }
        });
      }
    }
    setState((prev) => ({ ...prev, isPlaying: true }));
  };

  /**
   * Toggle play/pause
   */
  const togglePlayPause = (): void => {
    if (state.isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  /**
   * Play next track (supports Spotify / YT Music Autoplay infinite recommendations)
   */
  const next = async (): Promise<void> => {
    const { queue, queueIndex, repeat, autoplay, currentTrack } = stateRef.current;
    
    if (queue.length === 0 && !currentTrack) return;

    let nextIndex = queueIndex + 1;

    if (nextIndex >= queue.length) {
      if (repeat === 'all') {
        nextIndex = 0;
      } else if (autoplay && currentTrack) {
        // Autoplay Mode: Fetch 100% real dynamic, diverse recommendations (Spotify / YT Music style)
        try {
          const artistList = (currentTrack.artists || []).map((a) => a.name.trim()).filter(Boolean);
          const primaryArtist = artistList[0]?.split(',')[0]?.split('&')[0]?.trim() || '';
          const secondaryArtist = artistList[1]?.split(',')[0]?.split('&')[0]?.trim() || '';
          const cleanName = (currentTrack.name || '').replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
          const currentNormTitle = normalizeTitle(currentTrack.name || '');

          console.log(`[AUTOPLAY] Queue ended. Fetching diverse recommendations for: "${cleanName}" by "${primaryArtist}"`);
          
          let newTracks: Track[] = [];

          // Helper to check if a track or title was played in session or is in current queue
          const isSongAlreadyPlayed = (trackId: string, trackTitle: string): boolean => {
            if (trackId === currentTrack.id) return true;
            if (playedHistoryRef.current.has(trackId)) return true;
            const norm = normalizeTitle(trackTitle);
            if (norm && (norm === currentNormTitle || playedSongTitlesRef.current.has(norm))) return true;
            if (queue.some((q) => q.id === trackId || normalizeTitle(q.name) === norm)) return true;
            return false;
          };

          // Try 1: Express Radio Recommendations API
          try {
            const res = await api.get(`/radio/recommendations?trackId=${currentTrack.id}&trackName=${encodeURIComponent(cleanName)}&artistName=${encodeURIComponent(primaryArtist)}`);
            const fetched: Track[] = res.data?.tracks || [];
            if (fetched.length > 0) {
              // Shuffle fetched candidates for variety
              const shuffled = [...fetched].sort(() => Math.random() - 0.5);
              newTracks = shuffled.filter((t: Track) => !isSongAlreadyPlayed(t.id, t.name));
            }
          } catch {}

          // Try 2: Multi-Query Dynamic Search (Related Artists, Genres, Similar Hits)
          if (newTracks.length === 0) {
            const isEnglish = /[a-zA-Z]/.test(cleanName) && !/[\u0900-\u097F]/.test(cleanName);
            
            const searchQueries = [
              primaryArtist ? `${primaryArtist}` : '',
              primaryArtist && secondaryArtist ? `${secondaryArtist}` : '',
              primaryArtist ? `similar to ${primaryArtist}` : '',
              isEnglish ? 'Shawn Mendes hits' : 'Arijit Singh hits',
              isEnglish ? 'Ed Sheeran hits' : 'Shreya Ghoshal hits',
              isEnglish ? 'Dua Lipa hits' : 'Atif Aslam hits',
              isEnglish ? 'The Weeknd hits' : 'Jubin Nautiyal hits',
              isEnglish ? 'Taylor Swift hits' : 'Pritam hits',
              isEnglish ? 'top global pop charts' : 'top bollywood hits',
            ].filter(Boolean);

            for (const q of searchQueries) {
              try {
                const jioRes = await fetch(`https://jiosaavn-api-private.vercel.app/search/songs?q=${encodeURIComponent(q)}`);
                if (jioRes.ok) {
                  const data = await jioRes.json();
                  const results = data?.data?.results || data?.results || [];

                  if (Array.isArray(results) && results.length > 0) {
                    // Shuffle search results so different songs play every time
                    const shuffledResults = [...results].sort(() => Math.random() - 0.5);

                    const parsed: Track[] = shuffledResults.map((item: any) => {
                      const songId = item.id ? (item.id.startsWith('yt-') ? item.id : `yt-${item.id}`) : `yt-${Math.random()}`;
                      const rawImg = Array.isArray(item.image)
                        ? (item.image[2]?.link || item.image[1]?.link || item.image[0]?.link || item.image[0]?.url)
                        : (item.image || '/placeholder-album.png');
                      const artistStr = typeof item.primaryArtists === 'string' 
                        ? item.primaryArtists 
                        : (Array.isArray(item.primaryArtists) ? item.primaryArtists.map((a: any) => a.name).join(', ') : (item.subtitle || primaryArtist || 'Artist'));

                      return {
                        id: songId,
                        name: item.name || item.title || 'Recommended Song',
                        artists: [{ id: 'artist-1', name: artistStr }],
                        album: {
                          id: item.album?.id || 'album-1',
                          name: item.album?.name || item.name || 'Single',
                          imageUrl: rawImg,
                        },
                        durationMs: (parseInt(item.duration, 10) || 180) * 1000,
                        spotifyUrl: item.url || '',
                        playlistId: '',
                        userId: '',
                        explicit: false,
                        isOfflinePreferred: false,
                        addedAt: new Date().toISOString(),
                      };
                    });

                    const filtered = parsed.filter((t: Track) => !isSongAlreadyPlayed(t.id, t.name));

                    if (filtered.length > 0) {
                      newTracks = filtered;
                      console.log(`[AUTOPLAY] Discovered ${newTracks.length} diverse recommendations for query: "${q}"`);
                      break;
                    }
                  }
                }
              } catch (jioErr) {
                console.warn('[AUTOPLAY] JioSaavn search query skipped:', q, jioErr);
              }
            }
          }

          if (newTracks.length > 0) {
            const updatedQueue = [...queue, ...newTracks];
            const targetIndex = queue.length > 0 ? queue.length : 0;
            setState((prev) => ({
              ...prev,
              queue: updatedQueue,
              queueIndex: targetIndex,
            }));
            await playTrack(newTracks[0], updatedQueue);
            return;
          }
        } catch (autoErr) {
          console.warn('[AUTOPLAY] Recommendation process error:', autoErr);
        }
        return;
      } else {
        return;
      }
    }

    setState((prev) => ({ ...prev, queueIndex: nextIndex }));
    await playTrack(queue[nextIndex]);
  };

  /**
   * Play previous track
   */
  const previous = (): void => {
    const { queue, queueIndex, currentTime } = stateRef.current;

    // If more than 3 seconds played, restart current track
    if (currentTime > 3) {
      seek(0);
      return;
    }

    if (queue.length === 0) return;

    let prevIndex = queueIndex - 1;

    if (prevIndex < 0) {
      if (stateRef.current.repeat === 'all') {
        prevIndex = queue.length - 1;
      } else {
        return;
      }
    }

    setState((prev) => ({ ...prev, queueIndex: prevIndex }));
    playTrack(queue[prevIndex]);
  };

  /**
   * Handle track end
   */
  function handleTrackEnd(): void {
    const current = stateRef.current;
    // Report completion for the track that just ended
    if (current.currentTrack && trackingRef.current && !trackingRef.current.reported) {
      reportListeningEvent(current.currentTrack, 'complete', 100);
      trackingRef.current.reported = true;
    }

    if (current.repeat === 'one') {
      // Replay current track
      if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.seekTo === 'function') {
        try {
          youtubePlayerRef.current.seekTo(0, true);
          youtubePlayerRef.current.playVideo();
        } catch {
          // Player not ready
        }
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      // Play next track
      next();
    }
  };

  /**
   * Seek to time
   */
  const seek = (time: number): void => {
    if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.seekTo === 'function') {
      try {
        youtubePlayerRef.current.seekTo(time, true);
      } catch {
        // Player not ready
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setState((prev) => ({ ...prev, currentTime: time }));
  };

  /**
   * Set volume
   */
  const setVolume = (volume: number): void => {
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
    }

    try {
      localStorage.setItem('playerVolume', volume.toString());
    } catch {}

    if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.setVolume === 'function') {
      try {
        youtubePlayerRef.current.setVolume(volume * 100);
      } catch {
        // Player not ready
      }
    }
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    setState((prev) => ({ ...prev, volume }));
  };

  /**
   * Toggle mute / restore previous non-zero volume
   */
  const toggleMute = (): void => {
    if (state.volume === 0) {
      const restored = lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 0.7;
      setVolume(restored);
    } else {
      lastNonZeroVolumeRef.current = state.volume;
      setVolume(0);
    }
  };

  /**
   * Toggle repeat mode
   */
  const toggleRepeat = (): void => {
    setState((prev) => ({
      ...prev,
      repeat: prev.repeat === 'off' ? 'all' : prev.repeat === 'all' ? 'one' : 'off',
    }));
  };

  /**
   * Toggle shuffle
   */
  const toggleShuffle = (): void => {
    setState((prev) => ({ ...prev, shuffle: !prev.shuffle }));
  };

  /**
   * Toggle Autoplay
   */
  const toggleAutoplay = (): void => {
    setState((prev) => ({ ...prev, autoplay: !prev.autoplay }));
  };

  /**
   * Clear queue
   */
  const clearQueue = (): void => {
    setState((prev) => ({
      ...prev,
      queue: [],
      queueIndex: -1,
    }));
  };

  /**
   * Register OS Media Session action handlers for mobile background playback & lockscreen controls
   */
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.playVideo === 'function') {
            youtubePlayerRef.current.playVideo();
          } else {
            audioRef.current?.play();
          }
          setState((prev) => ({ ...prev, isPlaying: true }));
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          if (isYouTube && youtubePlayerRef.current && typeof youtubePlayerRef.current.pauseVideo === 'function') {
            youtubePlayerRef.current.pauseVideo();
          } else {
            audioRef.current?.pause();
          }
          setState((prev) => ({ ...prev, isPlaying: false }));
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => previous());
        navigator.mediaSession.setActionHandler('nexttrack', () => next());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) seek(details.seekTime);
        });
      } catch (e) {
        console.warn('MediaSession handler registration failed:', e);
      }
    }
  }, [state.currentTrack, state.isPlaying, isYouTube]);

  const value: PlayerContextType = {
    ...state,
    playTrack,
    pause,
    resume,
    togglePlayPause,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    toggleAutoplay,
    clearQueue,
    isYouTube,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

/**
 * Custom hook to use player context
 */
export const usePlayer = (): PlayerContextType => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};
