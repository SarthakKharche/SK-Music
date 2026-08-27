import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const code = searchParams.get('code');

    if (token) {
      localStorage.setItem('authToken', token);
      login(token).catch(console.warn).finally(() => {
        window.location.href = '/';
      });
    } else if (code) {
      import('../utils/api').then(({ default: api }) => {
        api.post('/auth/google/code-exchange', { code })
          .then((res) => {
            const authToken = res.data?.token;
            if (authToken) {
              localStorage.setItem('authToken', authToken);
              return login(authToken);
            }
            throw new Error('No token returned');
          })
          .catch((err) => {
            console.error('Code exchange failed:', err);
            window.location.href = '/login';
          })
          .finally(() => {
            window.location.href = '/';
          });
      });
    } else {
      window.location.href = '/login';
    }
  }, []);

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
