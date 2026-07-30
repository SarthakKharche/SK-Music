import { useState } from 'react';
import { FiMusic } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthUrl = (): string => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      return apiUrl.endsWith('/api') ? `${apiUrl}/auth/google` : `${apiUrl}/api/auth/google`;
    }
    // Development: navigate directly to the backend to avoid Vite proxy issues with OAuth redirects
    return 'http://localhost:5000/api/auth/google';
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const authUrl = getAuthUrl();

    // First, check if the server is reachable
    try {
      const healthUrl = authUrl.replace('/api/auth/google', '/health');
      await fetch(healthUrl, { mode: 'cors' });
    } catch {
      setError('Cannot reach the server. Make sure the backend is running on port 5000.');
      setLoading(false);
      return;
    }

    // Navigate to Google OAuth
    window.location.href = authUrl;
  };

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
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white text-spotify-black font-semibold py-3 px-6 rounded-full 
                     hover:bg-gray-100 transition-colors flex items-center justify-center gap-3
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-spotify-black"></div>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <FcGoogle size={24} />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm text-center">
            {error}
          </div>
        )}

        {/* Legal Notice */}
        <p className="text-xs text-spotify-lightgray text-center mt-6">
          For personal and educational use only. By logging in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
