import './env';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getFirestore } from './firebase';
import type { User } from '../types/user.types';

import CryptoJS from 'crypto-js';

/**
 * Configure Passport with Google OAuth 2.0 Strategy
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || '/api/auth/google/callback',
    },
    async (accessToken: string, refreshToken: string, profile, done) => {
      try {
        const db = getFirestore();
        const userRef = db.collection('users').doc(profile.id);
        const userDoc = await userRef.get();

        const email = profile.emails?.[0]?.value || '';
        const name = profile.displayName || '';
        const picture = profile.photos?.[0]?.value || '';

        const secret = process.env.JWT_SECRET!;
        const encryptedAccessToken = CryptoJS.AES.encrypt(accessToken, secret).toString();
        const encryptedRefreshToken = refreshToken
          ? CryptoJS.AES.encrypt(refreshToken, secret).toString()
          : null;
        const tokenExpiry = new Date(Date.now() + 3600 * 1000).toISOString(); // Google access token usually expires in 1 hour

        if (!userDoc.exists) {
          // Create new user
          const newUser: User = {
            uid: profile.id,
            email,
            name,
            picture,
            provider: 'google',
            spotifyConnected: false,
            googleAccessToken: encryptedAccessToken,
            googleRefreshToken: encryptedRefreshToken || undefined,
            googleTokenExpiry: tokenExpiry,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await userRef.set(newUser);
          return done(null, newUser);
        } else {
          // Update existing user
          const userData = userDoc.data() as User;
          userData.updatedAt = new Date().toISOString();
          
          const updates: Partial<User> = {
            name,
            picture,
            googleAccessToken: encryptedAccessToken,
            googleTokenExpiry: tokenExpiry,
            updatedAt: userData.updatedAt,
          };

          if (encryptedRefreshToken) {
            updates.googleRefreshToken = encryptedRefreshToken;
          }

          await userRef.update(updates);
          return done(null, { ...userData, ...updates });
        }
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

/**
 * Serialize user for session storage
 */
passport.serializeUser((user: any, done) => {
  done(null, user.uid);
});

/**
 * Deserialize user from session
 */
passport.deserializeUser(async (uid: string, done) => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return done(null, false);
    }

    done(null, userDoc.data() as User);
  } catch (error) {
    done(error);
  }
});

export default passport;
