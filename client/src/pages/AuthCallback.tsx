import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');

      if (!token) {
        console.error('No token in callback URL');
        navigate('/login');
        return;
      }

      try {
        await login(token);
        navigate('/');
      } catch (err) {
        console.error('Login failed:', err);
        setError('Login failed. Please try again.');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();

    // Safety timeout — if login takes too long, redirect back
    const timeout = setTimeout(() => {
      setError('Login is taking too long. Redirecting...');
      setTimeout(() => navigate('/login'), 2000);
    }, 15000);

    return () => clearTimeout(timeout);
  }, [searchParams, login, navigate]);

  return (
    <div className="flex items-center justify-center h-screen bg-spotify-black">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-400 mb-2">{error}</p>
            <p className="text-spotify-lightgray text-sm">Redirecting to login...</p>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green mx-auto mb-4"></div>
            <p className="text-spotify-lightgray">Logging you in...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
