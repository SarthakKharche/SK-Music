import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { isAuthenticated } from '../middleware/auth.middleware';
import { SpotifyService } from '../services/spotify.service';
import { getFirestore } from '../config/firebase';
import type { User } from '../types/user.types';

const router = Router();
const spotifyService = new SpotifyService();

/**
 * GET /api/auth/google/url
 * Return Google OAuth URL for direct browser redirect (bypasses ngrok warning)
 */
router.get('/google/url', (_req, res) => {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://sk-music-xi.vercel.app/api/auth/google/callback';
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const scope = encodeURIComponent('profile email https://www.googleapis.com/auth/youtube');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  res.json({ url });
});

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/youtube'],
    accessType: 'offline',
    prompt: 'consent',
    session: false,
  })
);

/**
 * GET /api/auth/google/callback
 * Google OAuth callback
 */
router.get(
  '/google/callback',
  (req, res, next) => {
    const targetClient = (process.env.CLIENT_URL || 'https://sk-music-xi.vercel.app').replace(/\/+$/, '');
    passport.authenticate('google', { failureRedirect: `${targetClient}/login`, session: false })(req, res, next);
  },
  (req, res) => {
    const user = req.user as User;
    
    const token = jwt.sign(
      { uid: user.uid, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    // Dynamically determine target client URL without trailing slash
    const targetClient = (process.env.CLIENT_URL || 'https://sk-music-xi.vercel.app').replace(/\/+$/, '');

    console.log(`[AUTH CALLBACK] Redirecting to: ${targetClient}/auth/callback`);
    res.redirect(`${targetClient}/auth/callback?token=${token}`);
  }
);

/**
 * GET /api/auth/spotify
 * Initiate Spotify OAuth flow
 */
router.get('/spotify', isAuthenticated, (req, res) => {
  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-email',
    'user-read-private',
    'user-top-read',
    'user-read-recently-played',
    'user-library-read',
  ];

  const user = req.user as User;
  const authUrl = spotifyService.getAuthorizationUrl(scopes, user.uid);
  res.json({ authUrl });
});

/**
 * GET /api/auth/spotify/callback
 * Spotify OAuth callback
 * Note: This route doesn't use isAuthenticated because it's called by Spotify's servers.
 * The user's uid is passed via the state parameter.
 */
router.get('/spotify/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const client = process.env.CLIENT_URL || 'https://localhost:5173';

    if (!code || typeof code !== 'string') {
      return res.redirect(`${client}/spotify/error?reason=missing_code`);
    }

    if (!state || typeof state !== 'string') {
      return res.redirect(`${client}/spotify/error?reason=missing_state`);
    }

    // The state parameter contains the user's uid
    const userId = state;

    // Exchange code for tokens
    await spotifyService.handleCallback(code, userId);

    return res.redirect(`${client}/spotify/connected`);
  } catch (error) {
    console.error('Spotify callback error:', error);
    const client = process.env.CLIENT_URL || 'https://localhost:5173';
    return res.redirect(`${client}/spotify/error?reason=callback_failed`);
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', isAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    return res.json({ message: 'Logged out successfully' });
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', isAuthenticated, async (req, res): Promise<void> => {
  try {
    const user = req.user as User;
    
    // Always attempt to fetch fresh data from Firestore
    try {
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data() as User;
        res.json({
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          spotifyConnected: userData.spotifyConnected || false,
          spotifyUserId: userData.spotifyUserId,
        });
        return;
      }
    } catch (dbErr) {
      console.warn('Firestore fetch failed, returning session user:', dbErr);
    }
    
    // Fallback if Firestore doc not found yet
    res.json({
      uid: user.uid,
      email: user.email,
      name: user.name || 'User',
      picture: user.picture || '',
      spotifyConnected: user.spotifyConnected || false,
      spotifyUserId: user.spotifyUserId,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

/**
 * POST /api/auth/verify-token
 * Verify JWT token
 */
router.post('/verify-token', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    return res.json({ valid: true, user: decoded });
  } catch (error) {
    return res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

export default router;
