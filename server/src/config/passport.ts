import './env';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getFirestore } from './firebase';
import type { User } from '../types/user.types';

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_accessToken: string, _refreshToken: string, profile, done) => {
      try {
        const db = getFirestore();
        const userRef = db.collection('users').doc(profile.id);
        const userDoc = await userRef.get();

        const email = profile.emails?.[0]?.value || '';
        const name = profile.displayName || '';
        const picture = profile.photos?.[0]?.value || '';

        if (!userDoc.exists) {
          // Create new user
          const newUser: User = {
            uid: profile.id,
            email,
            name,
            picture,
            provider: 'google',
            spotifyConnected: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await userRef.set(newUser);
          return done(null, newUser);
        } else {
          // Update existing user
          const userData = userDoc.data() as User;
          userData.updatedAt = new Date().toISOString();
          
          await userRef.update({
            name,
            picture,
            updatedAt: userData.updatedAt,
          });

          return done(null, userData);
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
