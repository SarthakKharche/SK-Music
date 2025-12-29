import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOffline } from '../contexts/OfflineContext';

const SpotifyCallback: React.FC = () => {
  const navigate = useNavigate();
  const { syncPlaylists } = useOffline();
  const [status, setStatus] = useState('Syncing your playlists...');

  useEffect(() => {
    const handleSync = async () => {
      try {
        await syncPlaylists();
        setStatus('Success! Redirecting...');
        setTimeout(() => navigate('/'), 2000);
      } catch (error) {
        console.error('Sync failed:', error);
        setStatus('Sync failed. Redirecting...');
        setTimeout(() => navigate('/'), 2000);
      }
    };

    handleSync();
  }, [syncPlaylists, navigate]);

  return (
    <div className="flex items-center justify-center h-screen bg-spotify-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green mx-auto mb-4"></div>
        <p className="text-spotify-lightgray">{status}</p>
      </div>
    </div>
  );
};

export default SpotifyCallback;
