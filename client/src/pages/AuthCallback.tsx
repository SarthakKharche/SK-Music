import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');

      if (!token) {
        console.error('No token in callback URL');
        navigate('/login', { replace: true });
        return;
      }

      try {
        await login(token);
        navigate('/', { replace: true });
      } catch (err) {
        console.warn('Callback error, navigating home with token stored:', err);
        navigate('/', { replace: true });
      }
    };

    handleCallback();
  }, [searchParams, login, navigate]);

  return (
    <div className="flex items-center justify-center h-screen bg-spotify-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green mx-auto mb-4"></div>
        <p className="text-spotify-lightgray">Logging you in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
