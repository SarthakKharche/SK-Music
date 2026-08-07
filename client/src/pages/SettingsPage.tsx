import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { indexedDB } from '../services/indexedDB';
import { SiSpotify } from 'react-icons/si';
import { FiTrash2, FiDatabase, FiLogOut } from 'react-icons/fi';
import { formatBytes } from '../utils/helpers';
import api from '../utils/api';

const SettingsPage: React.FC = () => {
  const { user, connectSpotify, logout } = useAuth();
  const { clearCache } = useOffline();
  const [stats, setStats] = useState({
    trackCount: 0,
    playlistCount: 0,
    cachedAudioCount: 0,
    totalCacheSizeBytes: 0,
  });
  const [, setUserStats] = useState({
    playlistCount: 0,
    trackCount: 0,
    offlineTrackCount: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const dbStats = await indexedDB.getStats();
      setStats(dbStats);

      try {
        const response = await api.get('/user/stats');
        setUserStats(response.data);
      } catch (error) {
        console.error('Failed to load user stats:', error);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Clear all cached audio? This cannot be undone.')) {
      try {
        await clearCache();
        await loadStats();
        alert('Cache cleared successfully');
      } catch (error) {
        console.error('Failed to clear cache:', error);
        alert('Failed to clear cache');
      }
    }
  };

  const handleClearAllData = async () => {
    if (
      confirm(
        'Clear ALL local data including playlists and tracks? This cannot be undone and you will need to sync again.'
      )
    ) {
      try {
        await indexedDB.clearAll();
        await loadStats();
        alert('All data cleared successfully');
      } catch (error) {
        console.error('Failed to clear data:', error);
        alert('Failed to clear data');
      }
    }
  };

  const handleDisconnectSpotify = async () => {
    if (confirm('Disconnect your Spotify account? You will need to reconnect to sync playlists.')) {
      try {
        await api.post('/spotify/disconnect');
        alert('Spotify disconnected. Please refresh the page.');
      } catch (error) {
        console.error('Failed to disconnect Spotify:', error);
        alert('Failed to disconnect Spotify');
      }
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out of SK Music?')) {
      try {
        await logout();
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-white">Settings</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded-full text-sm font-medium transition-all flex items-center gap-2 cursor-pointer"
        >
          <FiLogOut size={16} />
          Log Out
        </button>
      </div>

      {/* Account Section */}
      <section className="bg-spotify-gray rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-white mb-4">Account</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Google Account</p>
              <p className="text-sm text-spotify-lightgray">{user?.email || 'Logged in user'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white/10 hover:bg-red-600 text-white rounded-full text-sm font-medium transition-all flex items-center gap-2 cursor-pointer"
            >
              <FiLogOut size={16} />
              Log Out
            </button>
          </div>

          <div className="border-t border-spotify-black pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium flex items-center gap-2">
                  <SiSpotify className="text-spotify-green" />
                  Spotify Account
                </p>
                <p className="text-sm text-spotify-lightgray">
                  {user?.spotifyConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
              {user?.spotifyConnected ? (
                <button
                  onClick={handleDisconnectSpotify}
                  className="btn-secondary text-sm"
                >
                  Disconnect
                </button>
              ) : (
                <button onClick={connectSpotify} className="btn-primary text-sm">
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="bg-spotify-gray rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-white mb-4">Statistics</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-spotify-lightgray text-sm mb-1">Playlists</p>
            <p className="text-2xl font-bold text-white">{stats.playlistCount}</p>
          </div>
          <div>
            <p className="text-spotify-lightgray text-sm mb-1">Tracks</p>
            <p className="text-2xl font-bold text-white">{stats.trackCount}</p>
          </div>
          <div>
            <p className="text-spotify-lightgray text-sm mb-1">Cached Tracks</p>
            <p className="text-2xl font-bold text-white">{stats.cachedAudioCount}</p>
          </div>
          <div>
            <p className="text-spotify-lightgray text-sm mb-1">Cache Size</p>
            <p className="text-2xl font-bold text-white">
              {formatBytes(stats.totalCacheSizeBytes)}
            </p>
          </div>
        </div>
      </section>

      {/* Storage Section */}
      <section className="bg-spotify-gray rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
          <FiDatabase />
          Storage Management
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Clear Audio Cache</p>
              <p className="text-sm text-spotify-lightgray">
                Remove all cached audio files ({formatBytes(stats.totalCacheSizeBytes)})
              </p>
            </div>
            <button
              onClick={handleClearCache}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <FiTrash2 />
              Clear Cache
            </button>
          </div>

          <div className="border-t border-spotify-black pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Clear All Data</p>
                <p className="text-sm text-spotify-lightgray">
                  Remove all local data including playlists and tracks
                </p>
              </div>
              <button
                onClick={handleClearAllData}
                className="btn-secondary text-sm text-red-500 hover:text-red-400 flex items-center gap-2"
              >
                <FiTrash2 />
                Clear All
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-spotify-gray rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">About</h2>
        
        <div className="space-y-2 text-sm text-spotify-lightgray">
          <p>SK Music v1.0.0</p>
          <p>Offline-first music streaming PWA</p>
          <p className="text-xs mt-4">
            For personal and educational use only. Audio is sourced from external
            public sources and cached locally on your device. No audio files are
            stored in the cloud.
          </p>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
