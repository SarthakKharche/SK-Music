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
const clientOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173,https://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Initialize Firebase
initializeFirebase();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Trust proxy headers (needed for secure cookies behind reverse proxies)
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    // Allow all origins in development (supports Dev Tunnels, local IPs, etc.)
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    if (clientOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
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

// Rate limiting
app.use('/api', rateLimiter);

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/user', userRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/made-for-you', madeForYouRoutes);
app.use('/api/youtube-music', youtubeMusicRoutes);

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
