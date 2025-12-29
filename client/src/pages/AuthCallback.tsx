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
        navigate('/login');
        return;
      }

      try {
        await login(token);
        navigate('/');
      } catch (error) {
        console.error('Login failed:', error);
        navigate('/login');
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
