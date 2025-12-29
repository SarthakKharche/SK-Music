import './config/env';
import express from 'express';
import http from 'http';
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
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Environment variables loaded via import 'dotenv/config'

const app = express();
const PREFERRED_PORT = Number(process.env.PORT) || 5000;

// Initialize Firebase
initializeFirebase();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
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
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/user', userRoutes);
app.use('/api/audio', audioRoutes);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Error handler (must be last)
app.use(errorHandler);

// Start server with fallback if port is in use
console.log('Starting server...');

const startServer = (port: number, attemptsLeft: number): void => {
  const server = http.createServer(app);

  const onListen = (): void => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  };

  const onError = (error: NodeJS.ErrnoException): void => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} in use. Trying ${port + 1}...`);
      // Small delay to avoid immediate race when previous process is shutting down
      setTimeout(() => startServer(port + 1, attemptsLeft - 1), 300);
    } else {
      console.error('Server failed to start:', error);
    }
  };

  server.on('listening', onListen);
  server.on('error', onError);

  server.listen(port);
};

// Try preferred port, then up to the next 10 ports
startServer(PREFERRED_PORT, 10);

export default app;
