import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
 * Supports both session-based auth and JWT Bearer tokens
 */
export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // First, check session-based auth
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Then, check for JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Express.User;
      req.user = decoded;
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
export const hasSpotifyConnected = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user as AppUser;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!user.spotifyConnected || !user.spotifyAccessToken) {
    res.status(403).json({ error: 'Spotify account not connected' });
    return;
  }

  next();
};
