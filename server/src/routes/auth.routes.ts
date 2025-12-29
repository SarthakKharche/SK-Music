import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { isAuthenticated } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimiter';
import { SpotifyService } from '../services/spotify.service';
import { getFirestore } from '../config/firebase';
import type { User } from '../types/user.types';

const router = Router();
const spotifyService = new SpotifyService();

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get(
  '/google',
  authRateLimiter,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

/**
 * GET /api/auth/google/callback
 * Google OAuth callback
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as User;
    
    // Generate JWT token
    const token = jwt.sign(
      { uid: user.uid, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    // Redirect to client with token
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/auth/callback?token=${token}`);
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
    const clientUrl = process.env.CLIENT_URL || 'https://localhost:5173';

    if (!code || typeof code !== 'string') {
      return res.redirect(`${clientUrl}/spotify/error?reason=missing_code`);
    }

    if (!state || typeof state !== 'string') {
      return res.redirect(`${clientUrl}/spotify/error?reason=missing_state`);
    }

    // The state parameter contains the user's uid
    const userId = state;

    // Exchange code for tokens
    await spotifyService.handleCallback(code, userId);

    return res.redirect(`${clientUrl}/spotify/connected`);
  } catch (error) {
    console.error('Spotify callback error:', error);
    const clientUrl = process.env.CLIENT_URL || 'https://localhost:5173';
    return res.redirect(`${clientUrl}/spotify/error?reason=callback_failed`);
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
    
    // Always fetch fresh data from Firestore for JWT tokens
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    const userData = userDoc.data() as User;
    
    // Remove sensitive tokens from response
    const sanitizedUser = {
      uid: userData.uid,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      spotifyConnected: userData.spotifyConnected || false,
      spotifyUserId: userData.spotifyUserId,
    };
    
    res.json(sanitizedUser);
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
