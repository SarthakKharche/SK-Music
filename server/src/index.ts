import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { initializeFirebase } from './config/firebase';
import './config/passport';
import authRoutes from './routes/auth.routes';
import spotifyRoutes from './routes/spotify.routes';
import userRoutes from './routes/user.routes';
import audioRoutes from './routes/audio.routes';
import madeForYouRoutes from './routes/madeForYou.routes';
import youtubeMusicRoutes from './routes/youtube-music.routes';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Environment variables loaded via import 'dotenv/config'

const app = express();
const PREFERRED_PORT = Number(process.env.PORT) || 5000;

// Initialize Firebase
initializeFirebase();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Trust proxy headers (needed for secure cookies behind reverse proxies)
app.set('trust proxy', 1);

// CORS configuration - Allow all origins for seamless audio streaming & downloads
app.use(cors({
  origin: true,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/spotify', rateLimiter, spotifyRoutes);
app.use('/api/user', rateLimiter, userRoutes);
app.use('/api/audio', rateLimiter, audioRoutes);
app.use('/api/made-for-you', rateLimiter, madeForYouRoutes);
app.use('/api/youtube-music', rateLimiter, youtubeMusicRoutes);

// Health check
app.get('/health', (req, res) => {
  void req;
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug test endpoint
app.get('/api/test', (req, res) => {
  void req;
  res.json({ message: 'API is working', timestamp: new Date().toISOString() });
});

// Routes mounted above

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
console.log('Starting server...');

app.listen(PREFERRED_PORT, () => {
  console.log(`🚀 Server running on port ${PREFERRED_PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});
