import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMusic } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (user || token) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-spotify-black via-spotify-dark to-spotify-green flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-spotify-black rounded-2xl shadow-2xl p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <FiMusic className="text-spotify-green text-6xl mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">SK Music</h1>
          <p className="text-spotify-lightgray text-center">
            Offline-first music streaming PWA
          </p>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3 text-sm text-spotify-lightgray">
            <span className="text-spotify-green">✓</span>
            <span>Stream your Spotify playlists</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-spotify-lightgray">
            <span className="text-spotify-green">✓</span>
            <span>Download tracks for offline listening</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-spotify-lightgray">
            <span className="text-spotify-green">✓</span>
            <span>Works offline with cached content</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-spotify-lightgray">
            <span className="text-spotify-green">✓</span>
            <span>Sync across all your devices</span>
          </div>
        </div>

        {/* Login Button */}
        <a
          href={`${import.meta.env.VITE_API_URL || '/api'}/auth/google`}
          className="w-full bg-white text-spotify-black font-semibold py-3 px-6 rounded-full 
                     hover:bg-gray-100 transition-colors flex items-center justify-center gap-3"
        >
          <FcGoogle size={24} />
          <span>Continue with Google</span>
        </a>

        {/* Legal Notice */}
        <p className="text-xs text-spotify-lightgray text-center mt-6">
          For personal and educational use only. By logging in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
