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
  FiMaximize2,
  FiMinimize2,
  FiDownload,
  FiCheck
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
    togglePlayPause,
    next,
    previous,
    seek,
    setVolume: setPlayerVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
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
  const [showMobileVolume, setShowMobileVolume] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const fullscreenProgressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const fullscreenVolumeRef = useRef<HTMLDivElement>(null);
  const mobileVolumeRef = useRef<HTMLDivElement>(null);
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
    if (showMobileVolume && mobileVolumeRef.current) return mobileVolumeRef.current;
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
  }, [isDraggingProgress, isDraggingVolume, duration, isFullscreen, showMobileVolume, seek, setPlayerVolume]);

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
    return (
      <footer className="h-[90px] bg-[#181818] border-t border-[#282828] px-4 flex items-center">
        <div className="text-spotify-lightgray text-sm">No track playing</div>
      </footer>
    );
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
          ? 'fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-8 overflow-y-auto overflow-x-hidden' 
          : 'h-[90px] bg-[#181818] border-t border-[#282828] px-4 grid grid-cols-3 items-center'
      }`}
    >
      {isFullscreen ? (
        // Fullscreen Layout with Fixed Blurred Card Background
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 overflow-y-auto overflow-x-hidden">
          {/* Fixed Glowing Background Artwork */}
          {albumImageUrl ? (
            <img
              src={getHighResImageUrl(albumImageUrl)}
              alt=""
              className="fixed inset-0 w-full h-full object-cover filter blur-[100px] scale-125 opacity-55 saturate-150 brightness-90 transition-all duration-700 pointer-events-none select-none"
            />
          ) : (
            <div className="fixed inset-0 bg-gradient-to-b from-indigo-900/40 via-spotify-dark to-black pointer-events-none" />
          )}

          {/* Fixed Dark Overlay */}
          <div className="fixed inset-0 bg-black/55 backdrop-blur-2xl pointer-events-none" />

          <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-8 my-auto">
            {/* Album Art - Large */}
            {albumImageUrl && (
              <img
                src={getHighResImageUrl(albumImageUrl)}
                alt={albumName}
                className="w-80 h-80 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] object-cover border border-white/10"
              />
            )}
            
            {/* Track Info - Large */}
            <div className="text-center flex flex-col items-center">
              <div className="flex items-center gap-4">
                <h1 className="text-4xl font-bold text-white drop-shadow-md">{trackName}</h1>
                <button 
                  onClick={handleToggleLike}
                  className={`transition-transform hover:scale-110 cursor-pointer ${isLiked ? 'text-spotify-green' : 'text-white/40 hover:text-white'}`}
                  title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
                >
                  <FiHeart size={28} fill={isLiked ? '#1DB954' : 'none'} />
                </button>
              </div>
              <p className="text-xl text-spotify-lightgray mt-2 font-medium">{artistNames}</p>
            </div>

            {/* Controls - Large */}
            <div className="w-full">
              <div className="flex items-center justify-center gap-6 mb-6">
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
                  className="text-white hover:scale-110 transition-transform p-2"
                  title="Previous"
                >
                  <FiSkipBack size={32} />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-2xl"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <FiPause className="text-black" size={32} />
                  ) : (
                    <FiPlay className="text-black ml-1" size={32} />
                  )}
                </button>

                <button 
                  onClick={next}
                  className="text-white hover:scale-110 transition-transform p-2"
                  title="Next"
                >
                  <FiSkipForward size={32} />
                </button>

                <button 
                  onClick={toggleRepeat}
                  className={`p-2 relative transition-colors ${
                    repeat !== 'off' ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
                  }`}
                  title={`Repeat: ${repeat}`}
                >
                  <FiRepeat size={24} />
                  {repeat === 'one' && (
                    <span className="absolute top-0 right-0 text-[10px] font-bold bg-spotify-green text-black rounded-full w-4 h-4 flex items-center justify-center">
                      1
                    </span>
                  )}
                </button>
              </div>

              {/* Progress Bar - Large */}
              <div className="flex items-center gap-4 w-full mb-6">
                <span className="text-sm text-spotify-lightgray w-12 text-right font-mono select-none">
                  {formatDuration(localProgress * 1000)}
                </span>
                <div 
                  ref={fullscreenProgressRef}
                  className="flex-1 h-3 bg-white/20 rounded-full cursor-pointer group relative py-1"
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                >
                  <div 
                    className="h-full bg-white group-hover:bg-spotify-green rounded-full relative transition-colors"
                    style={{ width: `${progress}%` }}
                  >
                    <div 
                      className={`absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg ${
                        isDraggingProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      } transition-opacity`}
                    />
                  </div>
                </div>
                <span className="text-sm text-spotify-lightgray w-12 font-mono select-none">
                  {formatDuration(duration * 1000)}
                </span>
              </div>

              {/* Volume & Extras - Large */}
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={toggleMute}
                  className="text-[#b3b3b3] hover:text-white transition-colors p-2"
                >
                  <VolumeIcon size={20} />
                </button>
                <div 
                  ref={fullscreenVolumeRef}
                  className="w-32 h-3 bg-white/20 rounded-full cursor-pointer group relative py-1"
                  onClick={handleVolumeClick}
                  onMouseDown={handleVolumeMouseDown}
                >
                  <div 
                    className="h-full bg-white group-hover:bg-spotify-green rounded-full relative transition-colors"
                    style={{ width: `${volumePercent}%` }}
                  >
                    <div 
                      className={`absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md ${
                        isDraggingVolume ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      } transition-opacity`}
                    />
                  </div>
                </div>
                
                <button 
                  onClick={toggleFullscreen}
                  className="text-spotify-green hover:text-white transition-colors p-2 ml-4 cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen (F)'}
                >
                  {isFullscreen ? <FiMinimize2 size={24} /> : <FiMaximize2 size={24} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Normal Layout
        <>
      {/* Left: Now Playing */}
      <div className="flex items-center gap-4 min-w-[180px]">
        {albumImageUrl && (
          <img
            src={albumImageUrl}
            alt={albumName}
            className="w-14 h-14 rounded shadow-lg"
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
        {/* Control Buttons */}
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
            className="bg-white rounded-full w-8 h-8 flex items-center justify-center hover:scale-105 transition-transform"
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
            className={`p-1 relative transition-colors ${
              repeat !== 'off' ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'
            }`}
            title={`Repeat: ${repeat}`}
          >
            <FiRepeat size={16} />
            {repeat === 'one' && (
              <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-spotify-green text-black rounded-full w-3 h-3 flex items-center justify-center">
                1
              </span>
            )}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-[11px] text-[#a7a7a7] w-10 text-right font-mono select-none">
            {formatDuration(localProgress * 1000)}
          </span>
          <div 
            ref={progressRef}
            className="flex-1 h-2 bg-[#4d4d4d] rounded-full cursor-pointer group relative py-0.5"
            onClick={handleProgressClick}
            onMouseDown={handleProgressMouseDown}
          >
            <div 
              className="h-full bg-white group-hover:bg-spotify-green rounded-full relative transition-colors"
              style={{ width: `${progress}%` }}
            >
              <div 
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md ${
                  isDraggingProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                } transition-opacity`}
              />
            </div>
          </div>
          <span className="text-[11px] text-[#a7a7a7] w-10 font-mono select-none">
            {formatDuration(duration * 1000)}
          </span>
        </div>
      </div>

      {/* Right: Volume & Other Controls */}
      <div className="flex items-center justify-end gap-3 min-w-[180px]">
        {/* Touch & Mobile Volume Control Popover */}
        <div className="relative flex items-center gap-2">
          <button 
            onClick={() => {
              if (window.innerWidth <= 768) {
                setShowMobileVolume(!showMobileVolume);
              } else {
                toggleMute();
              }
            }}
            className="text-[#b3b3b3] hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10 active:scale-95"
            title="Volume"
          >
            <VolumeIcon size={18} />
          </button>

          {/* Desktop Volume Slider */}
          <div 
            ref={volumeRef}
            className="hidden sm:block w-24 h-2 bg-[#4d4d4d] rounded-full cursor-pointer group relative py-0.5"
            onClick={handleVolumeClick}
            onMouseDown={handleVolumeMouseDown}
          >
            <div 
              className="h-full bg-white group-hover:bg-spotify-green rounded-full relative transition-colors"
              style={{ width: `${volumePercent}%` }}
            >
              <div 
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md ${
                  isDraggingVolume ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                } transition-opacity`}
              />
            </div>
          </div>

          {/* Mobile Volume Control Popup Modal */}
          {showMobileVolume && (
            <div className="sm:hidden absolute bottom-12 right-0 bg-[#121826]/95 backdrop-blur-2xl border border-white/15 p-4 rounded-2xl shadow-2xl flex flex-col items-center gap-3 z-50 w-48">
              <div className="flex items-center justify-between w-full text-xs font-semibold text-white/80">
                <span>Volume</span>
                <span>{Math.round(volumePercent)}%</span>
              </div>
              <div 
                ref={mobileVolumeRef}
                className="w-full h-4 bg-white/20 rounded-full cursor-pointer relative py-1"
                onClick={handleVolumeClick}
                onMouseDown={handleVolumeMouseDown}
              >
                <div 
                  className="h-full bg-spotify-green rounded-full relative"
                  style={{ width: `${volumePercent}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg" />
                </div>
              </div>
              <button
                onClick={() => setShowMobileVolume(false)}
                className="text-xs text-white/60 hover:text-white mt-1 underline"
              >
                Done
              </button>
            </div>
          )}
        </div>

        <button 
          onClick={toggleFullscreen}
          className="text-[#b3b3b3] hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
        </button>
      </div>
      </>
      )}
    </footer>
  );
};

export default Player;
