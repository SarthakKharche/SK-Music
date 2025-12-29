import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { audioCacheManager } from '../services/audioCacheManager';
import { indexedDB } from '../services/indexedDB';
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
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  clearQueue: () => void;
  isYouTube: boolean;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
    currentTime: 0,
    duration: 0,
    queue: [],
    queueIndex: -1,
    repeat: 'off',
    shuffle: false,
  });

  const [isYouTube, setIsYouTube] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);

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
    if (!document.getElementById('youtube-player-container')) {
      const container = document.createElement('div');
      container.id = 'youtube-player-container';
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '-9999px';
      container.style.width = '1px';
      container.style.height = '1px';
      container.innerHTML = '<div id="youtube-player"></div>';
      document.body.appendChild(container);
    }
  }, []);

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

    audio.addEventListener('error', (e) => {
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
      // Update current track immediately for UI feedback
      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: false, // Will be set to true once audio starts
      }));

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
              wrapper.style.position = 'absolute';
              wrapper.style.left = '-9999px';
              wrapper.style.top = '-9999px';
              wrapper.innerHTML = '<div id="youtube-player"></div>';
              document.body.appendChild(wrapper);
              container = document.getElementById('youtube-player');
            } else {
              // Reset the container for new player
              container.innerHTML = '';
              const newPlayer = document.createElement('div');
              newPlayer.id = 'youtube-player';
              container.parentElement?.replaceChild(newPlayer, container);
            }
            
            try {
              youtubePlayerRef.current = new window.YT.Player('youtube-player', {
                height: '1',
                width: '1',
                videoId: videoId,
                playerVars: {
                  autoplay: 1,
                  controls: 0,
                  disablekb: 1,
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 0,
                  origin: window.location.origin,
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

      // Regular audio playback
      setIsYouTube(false);
      
      // Stop YouTube if playing
      if (youtubePlayerRef.current && typeof youtubePlayerRef.current.pauseVideo === 'function') {
        try {
          youtubePlayerRef.current.pauseVideo();
        } catch {
          // Player not ready
        }
      }
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }

      // Load and play
      audio.src = audioUrl;
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
    } else {
      audioRef.current?.play();
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
  const handleTrackEnd = (): void => {
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
