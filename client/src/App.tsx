import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { MadeForYouProvider } from './contexts/MadeForYouContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import SpotifyCallback from './pages/SpotifyCallback';
import HomePage from './pages/HomePage';
import PlaylistPage from './pages/PlaylistPage';
import SpotifyPlaylistPage from './pages/SpotifyPlaylistPage';
import SearchPage from './pages/SearchPage';
import OfflinePage from './pages/OfflinePage';
import SettingsPage from './pages/SettingsPage';
import MadeForYouPage from './pages/MadeForYouPage';
import MadeForYouPlaylistPage from './pages/MadeForYouPlaylistPage';
import YoutubeMusicHome from './pages/YoutubeMusicHome';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OfflineProvider>
          <PlayerProvider>
            <MadeForYouProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/spotify/connected" element={<SpotifyCallback />} />

              {/* Protected routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<HomePage />} />
                <Route path="playlist/:playlistId" element={<PlaylistPage />} />
                <Route path="spotify-playlist/:playlistId" element={<SpotifyPlaylistPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="offline" element={<OfflinePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="made-for-you" element={<MadeForYouPage />} />
                <Route path="made-for-you/:playlistId" element={<MadeForYouPlaylistPage />} />
                <Route path="youtube-music" element={<YoutubeMusicHome />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </MadeForYouProvider>
          </PlayerProvider>
        </OfflineProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
