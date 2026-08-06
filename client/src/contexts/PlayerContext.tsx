import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { audioCacheManager } from '../services/audioCacheManager';
import { indexedDB } from '../services/indexedDB';
import { recordListeningEvent } from '../services/madeForYouApi';
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
    };
  });

  const [isYouTube, setIsYouTube] = useState(false);
  const [, setYoutubeReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const lastPauseTimeRef = useRef<number>(0);
  const lastNonZeroVolumeRef = useRef<number>(state.volume > 0 ? state.volume : 0.7);

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
   * Initialize audio element
   */
  useEffect(() => {
    const audio = new Audio();
    audio.volume = state.volume;
    
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
    });

    audio.addEventListener('pause', () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
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

      // Add to listening history
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

      // Regular HTML5 / Cached Blob audio playback    // Set track and playing state
    setCurrentTrack(track);
    setIsPlaying(true);

    try {
      // 1. Get audio URL (IndexedDB offline blob or saavn: query)
      let url = await audioCacheManager.getAudioUrl(track);

      if (!url) {
        console.warn('No audio URL found for track');
        setIsPlaying(false);
        return;
      }

      // If instant saavn query, resolve direct 320kbps CDN link (<20ms)
      if (url.startsWith('saavn:')) {
        const parts = url.split(':');
        const query = parts[1];
        try {
          const saavnRes = await fetch(`https://saavn.dev/api/search/songs?query=${query}`);
          if (saavnRes.ok) {
            const saavnData = await saavnRes.json();
            const songs = saavnData?.data?.results;
            if (songs && songs.length > 0 && songs[0].downloadUrl) {
              const downloadUrls = songs[0].downloadUrl;
              const highestQual = downloadUrls[downloadUrls.length - 1]?.url || downloadUrls[0]?.url;
              if (highestQual) {
                url = highestQual;
              }
            }
          }
        } catch {
          // Fallback to youtube
        }
      }

      // Play via instant HTML5 Audio
      setIsYouTube(false);
      if (youtubePlayerRef.current && typeof youtubePlayerRef.current.pauseVideo === 'function') {
        try { youtubePlayerRef.current.pauseVideo(); } catch {}
      }
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('HTML5 audio play error:', err);
          });
        }
      }
    } catch (error) {
      console.error('Failed to play track:', error);
      setIsPlaying(false);
    }
      
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }

      // Load and play blob or audio stream
      audio.src = audioUrl;
      audio.load();
      await audio.play();

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
      }));
    } catch (error) {
      console.error('Failed to play track:', error);
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
   * Play next track
   */
  const next = (): void => {
    const { queue, queueIndex, repeat } = state;
    
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;

    if (nextIndex >= queue.length) {
      if (repeat === 'all') {
        nextIndex = 0;
      } else {
        return;
      }
    }

    setState((prev) => ({ ...prev, queueIndex: nextIndex }));
    playTrack(queue[nextIndex]);
  };

  /**
   * Play previous track
   */
  const previous = (): void => {
    const { queue, queueIndex, currentTime } = state;

    // If more than 3 seconds played, restart current track
    if (currentTime > 3) {
      seek(0);
      return;
    }

    if (queue.length === 0) return;

    let prevIndex = queueIndex - 1;

    if (prevIndex < 0) {
      if (state.repeat === 'all') {
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
    // Report completion for the track that just ended
    if (state.currentTrack && trackingRef.current && !trackingRef.current.reported) {
      reportListeningEvent(state.currentTrack, 'complete', 100);
      trackingRef.current.reported = true;
    }

    if (state.repeat === 'one') {
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
   * Clear queue
   */
  const clearQueue = (): void => {
    setState((prev) => ({
      ...prev,
      queue: [],
      queueIndex: -1,
    }));
  };

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
