import { usePlayer } from '../../contexts/PlayerContext';
import { useOffline } from '../../contexts/OfflineContext';
import { audioCacheManager } from '../../services/audioCacheManager';
import { 
  FiPlay, 
  FiPause, 
  FiSkipBack, 
  FiSkipForward, 
  FiRepeat, 
  FiShuffle,
  FiVolume2,
  FiVolume1,
  FiVolumeX,
  FiHeart,
  FiMusic,
  FiMaximize2,
  FiMinimize2,
  FiDownload,
  FiCheck,
  FiRadio
} from 'react-icons/fi';
import { formatDuration } from '../../utils/helpers';
import { useState, useRef, useEffect } from 'react';
import { indexedDB } from '../../services/indexedDB';
import api from '../../utils/api';
import type { Track } from '../../types';

const Player: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    repeat,
    shuffle,
    autoplay,
    togglePlayPause,
    next,
    previous,
    seek,
    setVolume: setPlayerVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    toggleAutoplay,
  } = usePlayer();

  const { toggleOfflineTrack, syncStatus } = useOffline();
  const [isCached, setIsCached] = useState(false);

  const checkCachedStatus = async () => {
    if (!currentTrack) return;
    const cached = await audioCacheManager.isTrackCached(currentTrack.id);
    setIsCached(cached);
  };

  useEffect(() => {
    if (currentTrack) {
      checkCachedStatus();
    }
  }, [currentTrack]);

  useEffect(() => {
    if (currentTrack) {
      const status = syncStatus.get(currentTrack.id);
      if (status?.status === 'cached') {
        setIsCached(true);
      } else if (status?.status === 'failed') {
        setIsCached(false);
      }
    }
  }, [syncStatus, currentTrack]);

  const handleToggleOffline = async () => {
    if (!currentTrack) return;
    const storedYtId = localStorage.getItem(`youtube_${currentTrack.id}`);
    if (!storedYtId && currentTrack.id.startsWith('yt-')) {
      localStorage.setItem(`youtube_${currentTrack.id}`, currentTrack.id.replace('yt-', ''));
    }
    await toggleOfflineTrack(currentTrack);
    await checkCachedStatus();
  };

  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const fullscreenProgressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const fullscreenVolumeRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isDraggingProgress) {
      setLocalProgress(currentTime);
    }
  }, [currentTime, isDraggingProgress]);

  const getActiveProgressRef = () => {
    return isFullscreen ? fullscreenProgressRef.current : progressRef.current;
  };

  const getActiveVolumeRef = () => {
    return isFullscreen ? fullscreenVolumeRef.current : volumeRef.current;
  };

  const calculateNewTime = (clientX: number): number | undefined => {
    const ref = getActiveProgressRef();
    if (!ref || !duration) return undefined;
    const rect = ref.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  };

  const calculateNewVolume = (clientX: number): number | undefined => {
    const ref = getActiveVolumeRef();
    if (!ref) return undefined;
    const rect = ref.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== undefined) {
      setLocalProgress(newTime);
      seek(newTime);
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingProgress(true);
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== undefined) {
      setLocalProgress(newTime);
      seek(newTime);
    }
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const newVol = calculateNewVolume(e.clientX);
    if (newVol !== undefined) {
      setPlayerVolume(newVol);
    }
  };

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingVolume(true);
    const newVol = calculateNewVolume(e.clientX);
    if (newVol !== undefined) {
      setPlayerVolume(newVol);
    }
  };

  // Mouse & Touch drag handlers for progress and volume sliders
  useEffect(() => {
    const handleMove = (clientX: number) => {
      if (isDraggingProgress) {
        const newTime = calculateNewTime(clientX);
        if (newTime !== undefined) {
          setLocalProgress(newTime);
        }
      }
      if (isDraggingVolume) {
        const newVol = calculateNewVolume(clientX);
        if (newVol !== undefined) {
          setPlayerVolume(newVol);
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        handleMove(e.touches[0].clientX);
      }
    };

    const handleUp = (clientX?: number) => {
      if (isDraggingProgress) {
        if (clientX !== undefined) {
          const newTime = calculateNewTime(clientX);
          if (newTime !== undefined) {
            setLocalProgress(newTime);
            seek(newTime);
          }
        }
        setIsDraggingProgress(false);
      }
      if (isDraggingVolume) {
        setIsDraggingVolume(false);
      }
    };

    const handleMouseUp = (e: MouseEvent) => handleUp(e.clientX);
    const handleTouchEnd = (e: TouchEvent) => {
      const clientX = e.changedTouches?.[0]?.clientX;
      handleUp(clientX);
    };

    if (isDraggingProgress || isDraggingVolume) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingProgress, isDraggingVolume, duration, isFullscreen, seek, setPlayerVolume]);

  // Fullscreen handler
  const toggleFullscreen = async () => {
    if (!playerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await playerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const getHighResImageUrl = (url?: string | null) => {
    if (!url) return '';
    let highRes = url;
    if (highRes.includes('=w120-h120') || highRes.includes('=w544-h544') || highRes.includes('=w120-h120-l90-rj') || highRes.includes('=w120-h120-p-l90-rj')) {
      highRes = highRes.replace(/=w\d+-h\d+[^\s]*/, '=w800-h800-l90-rj');
    } else if (highRes.includes('=s120') || highRes.includes('=s300')) {
      highRes = highRes.replace(/=s\d+/, '=s800');
    }
    if (highRes.includes('/default.jpg')) {
      highRes = highRes.replace('/default.jpg', '/maxresdefault.jpg');
    } else if (highRes.includes('/hqdefault.jpg')) {
      highRes = highRes.replace('/hqdefault.jpg', '/maxresdefault.jpg');
    } else if (highRes.includes('/mqdefault.jpg')) {
      highRes = highRes.replace('/mqdefault.jpg', '/maxresdefault.jpg');
    }
    return highRes;
  };

  const checkLikedStatus = async () => {
    if (!currentTrack) return;
    try {
      const tracks = await indexedDB.getTracksByPlaylist('custom_liked_songs');
      const found = tracks.some(t => t.id === currentTrack.id);
      setIsLiked(found);
    } catch {
      setIsLiked(false);
    }
  };

  useEffect(() => {
    if (currentTrack) {
      checkLikedStatus();
    }
  }, [currentTrack]);

  const handleToggleLike = async () => {
    if (!currentTrack) return;
    try {
      const likedTrack: Track = {
        ...currentTrack,
        playlistId: 'custom_liked_songs'
      };

      if (!isLiked) {
        await indexedDB.saveTracks([likedTrack]);
        const existingPlaylist = await indexedDB.getPlaylist('custom_liked_songs');
        if (!existingPlaylist) {
          await indexedDB.savePlaylists([{
            id: 'custom_liked_songs',
            userId: 'local',
            name: 'Liked Songs',
            description: 'Your favorite saved tracks',
            imageUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=60',
            trackCount: 1,
            isPublic: false,
            owner: { id: 'local', name: 'You' },
            spotifyUrl: '',
            lastSyncedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          }]);
        }
        if (navigator.onLine) {
          try {
            await api.post('/user/playlists/custom_liked_songs/tracks', { track: likedTrack });
          } catch { /* ignore */ }
        }
        setIsLiked(true);
      } else {
        await indexedDB.deleteTrack(currentTrack.id);
        if (navigator.onLine) {
          try {
            await api.delete(`/user/playlists/custom_liked_songs/tracks/${currentTrack.id}`);
          } catch { /* ignore */ }
        }
        setIsLiked(false);
      }
      window.dispatchEvent(new Event('playlists-updated'));
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  };

  // Listen for fullscreen changes & keyboard shortcut 'F'
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept browser modifier shortcuts (e.g. Ctrl+R, Cmd+R, Alt+F4)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Spacebar: Play / Pause
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
      // ArrowLeft: Seek -5s (Shift+ArrowLeft: Previous track)
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          previous();
        } else {
          const newTime = Math.max(0, localProgress - 5);
          setLocalProgress(newTime);
          seek(newTime);
        }
      }
      // ArrowRight: Seek +5s (Shift+ArrowRight: Next track)
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          next();
        } else {
          const newTime = Math.min(duration, localProgress + 5);
          setLocalProgress(newTime);
          seek(newTime);
        }
      }
      // ArrowUp: Volume +5%
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPlayerVolume(Math.min(1, Math.round((volume + 0.05) * 100) / 100));
      }
      // ArrowDown: Volume -5%
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPlayerVolume(Math.max(0, Math.round((volume - 0.05) * 100) / 100));
      }
      // 'M' or 'm': Toggle Mute
      else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
      // 'F' or 'f': Toggle Fullscreen
      else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
      // 'L' or 'l': Toggle Like
      else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleToggleLike();
      }
      // 'S' or 's': Toggle Shuffle
      else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleShuffle();
      }
      // 'R' or 'r': Toggle Repeat
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleRepeat();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    toggleFullscreen,
    togglePlayPause,
    previous,
    next,
    seek,
    localProgress,
    duration,
    volume,
    setPlayerVolume,
    handleToggleLike,
    toggleShuffle,
    toggleRepeat,
  ]);

  if (!currentTrack) {
    return null;
  }

  // Safely access nested properties
  const albumImageUrl = currentTrack.album?.imageUrl;
  const albumName = currentTrack.album?.name || 'Unknown Album';
  const trackName = currentTrack.name || 'Unknown Track';
  const artistNames = currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
  
  const progress = duration > 0 ? (localProgress / duration) * 100 : 0;
  const volumePercent = volume * 100;

  const VolumeIcon = volume === 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2;

  return (
    <footer 
      ref={playerRef}
      className={`${
        isFullscreen 
          ? 'fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 overflow-y-auto overflow-x-hidden' 
          : 'pointer-events-none md:pointer-events-auto md:h-[90px] md:bg-[#181818] md:border-t md:border-[#282828] w-full z-40'
      }`}
    >
      {isFullscreen ? (
        // Fullscreen Solid Dark Spotify Layout (No glassmorphism, clean icon-only play button, volume slider & download button)
        <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center p-6 md:p-10 overflow-y-auto overflow-x-hidden pointer-events-auto">
          {/* Top-Right Exit Fullscreen Button */}
          <button 
            onClick={toggleFullscreen}
            className="absolute top-4 right-4 md:top-6 md:right-6 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition-all z-20"
            title="Exit Fullscreen (ESC)"
          >
            <FiMinimize2 size={24} />
          </button>

          <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-6 md:gap-8 my-auto">
            {/* Album Art - Large Solid Card */}
            {albumImageUrl && (
              <img
                src={getHighResImageUrl(albumImageUrl)}
                alt={albumName}
                className="w-64 h-64 md:w-80 md:h-80 rounded-2xl shadow-2xl object-cover"
              />
            )}
            
            {/* Track Info - Large */}
            <div className="text-center flex flex-col items-center w-full px-4">
              <div className="flex items-center justify-center gap-4 w-full">
                <h1 className="text-2xl md:text-4xl font-bold text-white truncate max-w-lg">{trackName}</h1>
                <button 
                  onClick={handleToggleLike}
                  className={`transition-transform hover:scale-110 cursor-pointer flex-shrink-0 ${isLiked ? 'text-spotify-green' : 'text-white/40 hover:text-white'}`}
                  title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <FiHeart size={26} fill={isLiked ? '#1DB954' : 'none'} />
                </button>
                {(() => {
                  const status = currentTrack ? syncStatus.get(currentTrack.id) : null;
                  return (
                    <button
                      onClick={handleToggleOffline}
                      className={`transition-transform hover:scale-110 cursor-pointer flex-shrink-0 ${
                        isCached ? 'text-spotify-green' : 'text-white/40 hover:text-white'
                      }`}
                      disabled={status?.status === 'downloading'}
                      title={isCached ? 'Already downloaded (Click to remove)' : 'Download for offline'}
                    >
                      {status?.status === 'downloading' ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-spotify-green"></div>
                      ) : isCached ? (
                        <FiCheck size={26} />
                      ) : (
                        <FiDownload size={26} />
                      )}
                    </button>
                  );
                })()}
              </div>
              <p className="text-base md:text-xl text-spotify-lightgray mt-1.5 font-medium truncate max-w-md">{artistNames}</p>
            </div>

            {/* Controls - Icon-only Play/Pause (No Circle) */}
            <div className="w-full space-y-6">
              <div className="flex items-center justify-center gap-6 md:gap-8">
                <button 
                  onClick={toggleShuffle}
                  className={`p-2 transition-colors ${
                    shuffle ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title="Shuffle"
                >
                  <FiShuffle size={24} />
                </button>

                <button 
                  onClick={previous}
                  className="p-2 text-white hover:text-spotify-green transition-colors"
                  title="Previous"
                >
                  <FiSkipBack size={32} fill="white" />
                </button>

                {/* Pure Icon Play / Pause (No Circle / Shape Container) */}
                <button
                  onClick={togglePlayPause}
                  className="p-3 text-white hover:text-spotify-green hover:scale-110 active:scale-95 transition-all cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <FiPause size={48} className="text-white fill-white" />
                  ) : (
                    <FiPlay size={48} className="text-white fill-white" />
                  )}
                </button>

                <button 
                  onClick={next}
                  className="p-2 text-white hover:text-spotify-green transition-colors"
                  title="Next"
                >
                  <FiSkipForward size={32} fill="white" />
                </button>

                <button 
                  onClick={toggleRepeat}
                  className={`p-2 transition-colors relative ${
                    repeat !== 'off' ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title={repeat === 'one' ? 'Repeat One' : repeat === 'all' ? 'Repeat All' : 'Repeat Off'}
                >
                  <FiRepeat size={24} />
                  {repeat === 'one' && (
                    <span className="absolute top-1 right-1 text-[10px] font-bold bg-spotify-green text-black rounded-full w-3 h-3 flex items-center justify-center">1</span>
                  )}
                </button>

                <button 
                  onClick={toggleAutoplay}
                  className={`p-2 transition-colors ${
                    autoplay ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title={autoplay ? 'Autoplay On (Infinite Similar Tracks)' : 'Autoplay Off'}
                >
                  <FiRadio size={24} />
                </button>
              </div>

              {/* Progress Bar - Large */}
              <div className="space-y-2">
                <div 
                  ref={progressRef}
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                  className="relative w-full h-2.5 bg-white/20 hover:h-3.5 rounded-full cursor-pointer group transition-all"
                >
                  <div 
                    className="absolute top-0 left-0 h-full bg-spotify-green rounded-full relative"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs md:text-sm text-spotify-lightgray font-medium">
                  <span>{formatDuration(localProgress * 1000)}</span>
                  <span>{formatDuration(duration * 1000)}</span>
                </div>
              </div>

              {/* Fullscreen Sliding Volume Bar */}
              <div className="flex items-center justify-center gap-3 w-full max-w-xs mx-auto pt-2">
                <button onClick={toggleMute} className="text-spotify-lightgray hover:text-white transition-colors">
                  <VolumeIcon size={20} />
                </button>
                <div 
                  ref={volumeRef}
                  onClick={handleVolumeClick}
                  onMouseDown={handleVolumeMouseDown}
                  className="relative flex-1 h-1.5 bg-white/20 hover:h-2 rounded-full cursor-pointer group transition-all"
                >
                  <div 
                    className="absolute top-0 left-0 h-full bg-white group-hover:bg-spotify-green rounded-full relative"
                    style={{ width: `${volumePercent}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Normal Layout (Desktop 3-Column Footer + Mobile Spotify Floating Mini Player & Bottom Nav)
        <>
          {/* DESKTOP PLAYER (Hidden on Mobile) */}
          <div className="hidden md:grid grid-cols-3 items-center w-full h-full px-4">
            {/* Left: Now Playing */}
            <div className="flex items-center gap-4 min-w-[180px]">
              {albumImageUrl && (
                <img
                  src={albumImageUrl}
                  alt={albumName}
                  className="w-14 h-14 rounded shadow-lg object-cover"
                />
              )}
              <div className="flex flex-col min-w-0">
                <a 
                  href="#" 
                  className="text-sm text-white hover:underline truncate font-normal"
                >
                  {trackName}
                </a>
                <span className="text-[11px] text-[#b3b3b3] hover:text-white hover:underline truncate cursor-pointer">
                  {artistNames}
                </span>
              </div>
              <button 
                onClick={handleToggleLike}
                className={`ml-2 transition-colors cursor-pointer ${isLiked ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'}`}
                title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              >
                <FiHeart size={16} fill={isLiked ? '#1DB954' : 'none'} />
              </button>
              {(() => {
                const status = currentTrack ? syncStatus.get(currentTrack.id) : null;
                return (
                  <button
                    onClick={handleToggleOffline}
                    className={`ml-3 transition-colors ${
                      isCached
                        ? 'text-spotify-green hover:text-green-400'
                        : 'text-[#b3b3b3] hover:text-white'
                    }`}
                    disabled={status?.status === 'downloading'}
                    title={isCached ? 'Already downloaded (Click to remove)' : 'Download for offline'}
                  >
                    {status?.status === 'downloading' ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-spotify-green"></div>
                    ) : isCached ? (
                      <FiCheck size={16} />
                    ) : (
                      <FiDownload size={16} />
                    )}
                  </button>
                );
              })()}
            </div>

            {/* Center: Player Controls */}
            <div className="flex flex-col items-center max-w-[722px] w-full mx-auto">
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={toggleShuffle}
                  className={`p-1 transition-colors ${
                    shuffle ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title="Shuffle"
                >
                  <FiShuffle size={16} />
                </button>

                <button
                  onClick={previous}
                  className="p-1 text-[#b3b3b3] hover:text-white transition-colors"
                  title="Previous"
                >
                  <FiSkipBack size={20} fill="currentColor" />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <FiPause size={16} className="text-black" fill="black" />
                  ) : (
                    <FiPlay size={16} className="text-black ml-0.5" fill="black" />
                  )}
                </button>

                <button
                  onClick={next}
                  className="p-1 text-[#b3b3b3] hover:text-white transition-colors"
                  title="Next"
                >
                  <FiSkipForward size={20} fill="currentColor" />
                </button>

                <button
                  onClick={toggleRepeat}
                  className={`p-1 transition-colors relative ${
                    repeat !== 'off' ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title={repeat === 'one' ? 'Repeat One' : repeat === 'all' ? 'Repeat All' : 'Repeat Off'}
                >
                  <FiRepeat size={16} />
                  {repeat === 'one' && (
                    <span className="absolute -top-1 -right-1 text-[8px] bg-spotify-green text-black rounded-full w-3 h-3 flex items-center justify-center">1</span>
                  )}
                </button>

                <button
                  onClick={toggleAutoplay}
                  className={`p-1 transition-colors ${
                    autoplay ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title={autoplay ? 'Autoplay On (Infinite Similar Tracks)' : 'Autoplay Off'}
                >
                  <FiRadio size={16} />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="flex items-center gap-2 w-full">
                <span className="text-[11px] text-[#b3b3b3] min-w-[40px] text-right">
                  {formatDuration(localProgress * 1000)}
                </span>
                <div 
                  ref={progressRef}
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                  className="relative flex-1 h-1 bg-[#4d4d4d] hover:h-1.5 rounded-full cursor-pointer group transition-all"
                >
                  <div 
                    className="absolute top-0 left-0 h-full bg-white group-hover:bg-spotify-green rounded-full relative"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-[11px] text-[#b3b3b3] min-w-[40px]">
                  {formatDuration(duration * 1000)}
                </span>
              </div>
            </div>

            {/* Right: Volume & Extras */}
            <div className="flex items-center justify-end gap-3 min-w-[180px]">
              <button 
                onClick={toggleFullscreen}
                className="p-1 text-[#b3b3b3] hover:text-white transition-colors"
                title="Fullscreen (F)"
              >
                <FiMaximize2 size={16} />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-1 text-[#b3b3b3] hover:text-white transition-colors"
                >
                  <VolumeIcon size={16} />
                </button>
                <div 
                  ref={volumeRef}
                  onClick={handleVolumeClick}
                  onMouseDown={handleVolumeMouseDown}
                  className="relative w-24 h-1 bg-[#4d4d4d] hover:h-1.5 rounded-full cursor-pointer group transition-all"
                >
                  <div 
                    className="absolute top-0 left-0 h-full bg-white group-hover:bg-spotify-green rounded-full relative"
                    style={{ width: `${volumePercent}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE SPOTIFY SOLID FLOATING MINI-PLAYER CARD (Solid #181818, Icon-only play button) */}
          <div className="md:hidden fixed bottom-[58px] left-2 right-2 z-50 pointer-events-auto bg-[#181818] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            {/* Top Attached Thin Progress Line */}
            <div className="w-full h-[3px] bg-white/15 relative">
              <div 
                className="h-full bg-spotify-green transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div 
              onClick={toggleFullscreen}
              className="px-3 py-2 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.98] transition-transform"
            >
              {/* Left: Album Cover + Song Title & Artist */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {albumImageUrl ? (
                  <img
                    src={albumImageUrl}
                    alt={albumName}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-spotify-green/20 flex items-center justify-center flex-shrink-0">
                    <FiMusic className="text-spotify-green text-base" />
                  </div>
                )}

                <div className="flex flex-col min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate leading-tight">
                    {trackName}
                  </h4>
                  <p className="text-[11px] text-white/60 truncate mt-0.5">
                    {artistNames}
                  </p>
                </div>
              </div>

              {/* Right: Quick Action Controls (Icon-only play button, no circle) */}
              <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={handleToggleLike}
                  className={`p-2 transition-colors ${isLiked ? 'text-spotify-green' : 'text-white/60 hover:text-white'}`}
                  title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <FiHeart size={18} fill={isLiked ? '#1DB954' : 'none'} />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="p-2 text-white hover:text-spotify-green active:scale-95 transition-transform"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <FiPause size={22} className="text-white fill-white" />
                  ) : (
                    <FiPlay size={22} className="text-white fill-white" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </footer>
  );
};

export default Player;
