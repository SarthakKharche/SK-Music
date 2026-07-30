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
  FiList,
  FiDownload,
  FiCheck
} from 'react-icons/fi';
import { formatDuration } from '../../utils/helpers';
import { useState, useRef, useEffect } from 'react';

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
      if (status?.status === 'completed') {
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
  const volumeRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isDraggingProgress) {
      setLocalProgress(currentTime);
    }
  }, [currentTime, isDraggingProgress]);

  // Mouse drag handlers for progress and volume sliders
  useEffect(() => {
    const updateProgress = (e: MouseEvent): number | undefined => {
      if (!progressRef.current) return undefined;
      const rect = progressRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = percent * duration;
      setLocalProgress(newTime);
      return newTime;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingProgress) {
        updateProgress(e);
      }
      if (isDraggingVolume && volumeRef.current) {
        const rect = volumeRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setPlayerVolume(percent);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingProgress) {
        const newTime = updateProgress(e);
        if (newTime !== undefined) {
          seek(newTime);
        }
        setIsDraggingProgress(false);
      }
      if (isDraggingVolume) {
        setIsDraggingVolume(false);
      }
    };

    if (isDraggingProgress || isDraggingVolume) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingProgress, isDraggingVolume, duration, seek, setPlayerVolume]);

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

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setIsDraggingProgress(true);
    // Calculate and update progress immediately
    if (progressRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = percent * duration;
      setLocalProgress(newTime);
    }
  };

  const VolumeIcon = volume === 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2;

  return (
    <footer 
      ref={playerRef}
      className={`${
        isFullscreen 
          ? 'fixed inset-0 z-50 bg-gradient-to-b from-spotify-dark to-black flex flex-col items-center justify-center p-8' 
          : 'h-[90px] bg-[#181818] border-t border-[#282828] px-4 grid grid-cols-3 items-center'
      }`}
    >
      {isFullscreen ? (
        // Fullscreen Layout
        <div className="w-full max-w-4xl flex flex-col items-center gap-8">
          {/* Album Art - Large */}
          {albumImageUrl && (
            <img
              src={albumImageUrl}
              alt={albumName}
              className="w-80 h-80 rounded-lg shadow-2xl"
            />
          )}
          
          {/* Track Info - Large */}
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">{trackName}</h1>
            <p className="text-xl text-spotify-lightgray">{artistNames}</p>
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
                className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
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
                  <span className="absolute -top-1 -right-1 text-xs font-bold bg-spotify-green text-black rounded-full w-5 h-5 flex items-center justify-center">
                    1
                  </span>
                )}
              </button>
              {(() => {
                const status = currentTrack ? syncStatus.get(currentTrack.id) : null;
                return (
                  <button
                    onClick={handleToggleOffline}
                    className={`p-2 transition-colors ${
                      isCached
                        ? 'text-spotify-green hover:text-green-400'
                        : 'text-[#b3b3b3] hover:text-white'
                    }`}
                    disabled={status?.status === 'downloading'}
                    title={isCached ? 'Already downloaded (Click to remove)' : 'Download for offline'}
                  >
                    {status?.status === 'downloading' ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-spotify-green"></div>
                    ) : isCached ? (
                      <FiCheck size={24} />
                    ) : (
                      <FiDownload size={24} />
                    )}
                  </button>
                );
              })()}
            </div>

            {/* Progress Bar - Large */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#a7a7a7] w-14 text-right font-mono">
                {formatDuration(localProgress * 1000)}
              </span>
              <div 
                ref={progressRef}
                className="flex-1 h-2 bg-[#4d4d4d] rounded-full cursor-pointer group relative"
                onMouseDown={handleProgressMouseDown}
              >
                <div 
                  className="h-full bg-spotify-green rounded-full relative transition-colors"
                  style={{ width: `${progress}%` }}
                >
                  <div 
                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md ${
                      isDraggingProgress ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    } transition-opacity`}
                  />
                </div>
              </div>
              <span className="text-sm text-[#a7a7a7] w-14 font-mono">
                {formatDuration(duration * 1000)}
              </span>
            </div>

            {/* Volume & Exit Fullscreen */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <button 
                onClick={() => setPlayerVolume(volume === 0 ? 0.5 : 0)}
                className="text-[#b3b3b3] hover:text-white transition-colors p-2"
              >
                <VolumeIcon size={20} />
              </button>
              <div 
                ref={volumeRef}
                className="w-32 h-2 bg-[#4d4d4d] rounded-full cursor-pointer group relative"
                onMouseDown={(e) => {
                  setIsDraggingVolume(true);
                  const rect = volumeRef.current?.getBoundingClientRect();
                  if (rect) {
                    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    setPlayerVolume(percent);
                  }
                }}
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
                className="text-spotify-green hover:text-white transition-colors p-2 ml-4"
                title="Exit Fullscreen (ESC)"
              >
                <FiMaximize2 size={20} />
              </button>
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
          onClick={() => setIsLiked(!isLiked)}
          className={`ml-2 transition-colors ${isLiked ? 'text-spotify-green' : 'text-[#b3b3b3] hover:text-white'}`}
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
          <span className="text-[11px] text-[#a7a7a7] w-10 text-right font-mono">
            {formatDuration(localProgress * 1000)}
          </span>
          <div 
            ref={progressRef}
            className="flex-1 h-1 bg-[#4d4d4d] rounded-full cursor-pointer group relative"
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
          <span className="text-[11px] text-[#a7a7a7] w-10 font-mono">
            {formatDuration(duration * 1000)}
          </span>
        </div>
      </div>

      {/* Right: Volume & Other Controls */}
      <div className="flex items-center justify-end gap-3 min-w-[180px]">
        <button className="text-[#b3b3b3] hover:text-white transition-colors p-1">
          <FiList size={16} />
        </button>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPlayerVolume(volume === 0 ? 0.5 : 0)}
            className="text-[#b3b3b3] hover:text-white transition-colors p-1"
          >
            <VolumeIcon size={16} />
          </button>
          <div 
            ref={volumeRef}
            className="w-24 h-1 bg-[#4d4d4d] rounded-full cursor-pointer group relative"
            onMouseDown={(e) => {
              setIsDraggingVolume(true);
              const rect = volumeRef.current?.getBoundingClientRect();
              if (rect) {
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setPlayerVolume(percent);
              }
            }}
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
        </div>

        <button 
          onClick={toggleFullscreen}
          className="text-[#b3b3b3] hover:text-white transition-colors p-1"
          title="Fullscreen"
        >
          <FiMaximize2 size={14} />
        </button>
      </div>
      </>
      )}
    </footer>
  );
};

export default Player;
