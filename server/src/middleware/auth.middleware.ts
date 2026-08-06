import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getFirestore } from '../config/firebase';
import type { User as AppUser } from '../types/user.types';

/**
 * Extend Express Request to include user
 * Use interface merging to add our User properties to Express.User
 */
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User {
      uid: string;
      email: string;
      name: string;
      picture?: string;
      provider: 'google';
      spotifyConnected: boolean;
      spotifyUserId?: string;
      spotifyAccessToken?: string;
      spotifyRefreshToken?: string;
      spotifyTokenExpiry?: string;
      createdAt: string;
      updatedAt: string;
    }
  }
}

/**
 * Middleware to check if user is authenticated
 * Supports both session-based auth and JWT Bearer tokens.
 * When using JWT, hydrates the full user from Firestore so downstream
 * middleware (e.g. hasSpotifyConnected) has all user fields.
 */
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // First, check session-based auth
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Then, check for JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { uid: string; email: string };

      // Hydrate full user from Firestore so spotifyConnected etc. are available
      try {
        const db = getFirestore();
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          req.user = userDoc.data() as Express.User;
        } else {
          req.user = {
            uid: decoded.uid,
            email: decoded.email,
            name: decoded.email ? decoded.email.split('@')[0] : 'User',
            provider: 'google',
            spotifyConnected: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
      } catch (dbError) {
        req.user = {
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.email ? decoded.email.split('@')[0] : 'User',
          provider: 'google',
          spotifyConnected: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      return next();
    } catch (error) {
      // Token invalid, fall through to unauthorized
    }
  }
  
  res.status(401).json({ error: 'Unauthorized. Please login.' });
};

/**
 * Middleware to check if user has connected Spotify
 */
export const hasSpotifyConnected = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = req.user as AppUser;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!user.spotifyConnected || !user.spotifyAccessToken) {
    res.status(403).json({ error: 'Spotify account not connected' });
    return;
  }

  try {
    const { SpotifyService } = await import('../services/spotify.service');
    const spotifyService = new SpotifyService();
    // Pre-emptively fetch/refresh token to handle auth errors gracefully
    await spotifyService.getUserAccessToken(user.uid);
    next();
  } catch (error: any) {
    console.error('[Middleware] Spotify auth token validation failed:', error.message);
    res.status(403).json({ error: 'Spotify session expired. Please reconnect your Spotify account.' });
  }
};
