# SK Music - Architecture Documentation

## System Overview

SK Music is an offline-first Progressive Web App (PWA) that provides a music streaming experience similar to Spotify, but with the ability to work completely offline by caching audio locally on each device.

## Core Principles

### 1. Offline-First Architecture
- **Metadata in Cloud**: User profiles, playlists, tracks, and preferences stored in Firestore
- **Audio Local Only**: Audio files cached in IndexedDB per device, never uploaded to cloud
- **Progressive Enhancement**: App works offline with cached content, syncs when online

### 2. Legal Compliance
- **No Spotify Audio**: Uses Spotify Web API ONLY for metadata (track names, artists, albums, artwork)
- **External Audio Sources**: Resolves audio from legitimate external public sources
- **No Piracy**: No bulk download, no DRM circumvention, no unauthorized distribution

### 3. Cross-Device Sync
- **User logs in on Device A**: Downloads playlists, marks tracks for offline
- **User logs in on Device B**: Syncs preferences, automatically downloads same tracks locally
- **Each device**: Maintains its own audio cache independently

## Architecture Layers

### Layer 1: Client (Browser)

```
┌─────────────────────────────────────────────────┐
│             React Application                   │
├─────────────────────────────────────────────────┤
│  Components                                     │
│  ├─ Layout (Sidebar, Player, Offline Banner)   │
│  ├─ Pages (Home, Playlist, Offline, Settings)  │
│  └─ Auth (Protected Routes, OAuth Callbacks)   │
├─────────────────────────────────────────────────┤
│  Context (State Management)                     │
│  ├─ AuthContext: User authentication state     │
│  ├─ PlayerContext: Audio playback state        │
│  └─ OfflineContext: Offline sync & network     │
├─────────────────────────────────────────────────┤
│  Services                                       │
│  ├─ IndexedDB Manager: Local data persistence  │
│  ├─ Audio Cache Manager: Audio download/cache  │
│  └─ API Client: HTTP requests to server        │
├─────────────────────────────────────────────────┤
│  IndexedDB                                      │
│  ├─ playlists: Playlist metadata               │
│  ├─ tracks: Track metadata                     │
│  ├─ audio: Cached audio blobs                  │
│  └─ metadata: App state, sync timestamps       │
├─────────────────────────────────────────────────┤
│  Service Worker                                 │
│  ├─ Cache app shell (HTML, CSS, JS)            │
│  ├─ Cache API responses (metadata)             │
│  └─ Cache images (album artwork)               │
└─────────────────────────────────────────────────┘
```

### Layer 2: Server (Node.js/Express)

```
┌─────────────────────────────────────────────────┐
│             Express Server                      │
├─────────────────────────────────────────────────┤
│  Routes                                         │
│  ├─ /api/auth: OAuth flows, JWT management     │
│  ├─ /api/spotify: Playlist sync, track fetch   │
│  ├─ /api/user: Preferences, stats              │
│  └─ /api/audio: Audio source resolution        │
├─────────────────────────────────────────────────┤
│  Services                                       │
│  ├─ SpotifyService: API calls, token refresh   │
│  ├─ AudioResolverService: External audio API   │
│  └─ Firebase: Firestore operations             │
├─────────────────────────────────────────────────┤
│  Middleware                                     │
│  ├─ Authentication: JWT verification            │
│  ├─ Rate Limiting: API abuse prevention        │
│  └─ Error Handling: Global error handler       │
└─────────────────────────────────────────────────┘
```

### Layer 3: Data Storage

```
┌─────────────────────────────────────────────────┐
│             Firestore (Cloud)                   │
├─────────────────────────────────────────────────┤
│  Collections                                    │
│  ├─ users                                       │
│  │   ├─ uid (Google UID)                        │
│  │   ├─ email, name, picture                    │
│  │   ├─ spotifyConnected, spotifyUserId         │
│  │   └─ spotifyAccessToken (encrypted)          │
│  ├─ playlists                                   │
│  │   ├─ id (Spotify playlist ID)                │
│  │   ├─ userId, name, description               │
│  │   ├─ imageUrl, trackCount                    │
│  │   └─ lastSyncedAt                            │
│  └─ tracks                                      │
│      ├─ id (Spotify track ID)                   │
│      ├─ playlistId, userId                      │
│      ├─ name, artists, album                    │
│      ├─ durationMs, explicit                    │
│      └─ isOfflinePreferred (sync flag)          │
└─────────────────────────────────────────────────┘

CRITICAL: NO audio files stored in Firestore
```

### Layer 4: External Services

```
┌─────────────────────────────────────────────────┐
│          External APIs                          │
├─────────────────────────────────────────────────┤
│  Google OAuth                                   │
│  └─ User authentication                         │
│                                                 │
│  Spotify Web API                                │
│  ├─ User profile                                │
│  ├─ Playlists (read-only)                       │
│  ├─ Tracks metadata                             │
│  └─ Album artwork URLs                          │
│                                                 │
│  Audio Resolver API (External)                  │
│  └─ Resolve public audio sources                │
│     (NOT Spotify audio)                         │
└─────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Initial Setup Flow

```
User Opens App
      ↓
[Not Logged In]
      ↓
Click "Login with Google"
      ↓
Google OAuth Flow
      ↓
Server creates/updates user in Firestore
      ↓
Server returns JWT token
      ↓
Client stores token in localStorage
      ↓
[Logged In]
      ↓
Check if Spotify connected
      ↓
[If No] → Show "Connect Spotify" screen
      ↓
User clicks "Connect Spotify"
      ↓
Spotify OAuth Flow
      ↓
Server exchanges code for tokens
      ↓
Server fetches playlists from Spotify API
      ↓
Server saves playlist metadata to Firestore
      ↓
Client syncs playlists to IndexedDB
      ↓
[Ready to Use]
```

### Playback Flow (Cache-First)

```
User clicks Play on Track
      ↓
Check IndexedDB for cached audio
      ↓
[If Cached]
   └─→ Create blob URL from cache
       └─→ Play audio immediately
       └─→ Update lastAccessedAt
      ↓
[If Not Cached]
   └─→ Request audio source from server
       └─→ Server queries external audio resolver
       └─→ Server returns audio URL
       └─→ Client streams audio while downloading
       └─→ Client caches blob in IndexedDB
       └─→ Future plays use cache
```

### Offline Download Flow

```
User toggles "Download for Offline"
      ↓
Update isOfflinePreferred in IndexedDB
      ↓
[If Online]
   └─→ Sync preference to Firestore
      ↓
Request audio source from server
      ↓
Download audio in background
      ↓
Show progress (0-100%)
      ↓
Store blob in IndexedDB
      ↓
Update UI: "Cached" badge
```

### Cross-Device Sync Flow

```
User logs in on New Device
      ↓
Fetch user data from Firestore
      ↓
Fetch playlists where userId = current user
      ↓
Save playlists to local IndexedDB
      ↓
Fetch tracks where userId = current user
      ↓
Save tracks to local IndexedDB
      ↓
Filter tracks where isOfflinePreferred = true
      ↓
Auto-download each track:
   └─→ Resolve audio source
   └─→ Download audio
   └─→ Cache in IndexedDB
   └─→ Show download progress
      ↓
[Device Ready] - User can now use app offline
```

## Security Architecture

### Authentication Flow

```
1. Google OAuth
   ├─ User clicks "Login with Google"
   ├─ Redirect to Google OAuth consent screen
   ├─ User approves scopes (profile, email)
   ├─ Google redirects to callback with code
   ├─ Server exchanges code for Google tokens
   ├─ Server fetches user profile from Google
   ├─ Server creates/updates user in Firestore
   └─ Server generates JWT token

2. JWT Token
   ├─ Payload: { uid, email }
   ├─ Expiry: 7 days
   ├─ Stored in localStorage (client)
   └─ Sent in Authorization header

3. Spotify OAuth
   ├─ User clicks "Connect Spotify"
   ├─ Server generates Spotify auth URL with scopes
   ├─ User redirects to Spotify consent screen
   ├─ Spotify redirects to callback with code
   ├─ Server exchanges code for Spotify tokens
   ├─ Server encrypts tokens (AES) before storage
   └─ Server stores encrypted tokens in Firestore
```

### Token Management

```
Spotify Access Token Refresh
      ↓
Before each Spotify API call:
      ↓
Check token expiry in Firestore
      ↓
[If Expired]
   └─→ Use refresh token
   └─→ Request new access token from Spotify
   └─→ Encrypt new tokens
   └─→ Update Firestore
   └─→ Use new access token
      ↓
[If Valid]
   └─→ Decrypt token
   └─→ Use for API call
```

## Offline Behavior

### Offline Detection

```javascript
// Client detects offline
navigator.onLine === false
      ↓
Trigger OfflineContext state update
      ↓
Show offline banner in UI
      ↓
Disable network-dependent features:
   ├─ Sync playlists
   ├─ Connect Spotify
   └─ Download new tracks
      ↓
Enable offline features:
   ├─ Play cached tracks
   ├─ Browse cached playlists
   └─ View offline library
```

### Service Worker Cache Strategy

```
Request Type         | Strategy        | Cache Name
---------------------|-----------------|------------------
App Shell (HTML/CSS) | Cache First     | precache-v1
JavaScript Bundles   | Cache First     | precache-v1
API Responses        | Network First   | api-cache-v1
Album Artwork        | Cache First     | images-cache-v1
Spotify Images       | Cache First     | spotify-images
Google Fonts         | Cache First     | fonts-cache
```

## Storage Management

### IndexedDB Schema

```javascript
Database: sk-music-db (version 1)

Object Stores:

1. playlists
   - keyPath: id
   - Data: Playlist metadata
   - Indexes: none

2. tracks
   - keyPath: id
   - Data: Track metadata
   - Indexes:
     * by-playlist: playlistId
     * by-offline: isOfflinePreferred

3. audio
   - keyPath: trackId
   - Data: CachedAudio (blob, format, quality, size)
   - Indexes:
     * by-size: sizeBytes
     * by-accessed: lastAccessedAt

4. metadata
   - keyPath: key
   - Data: Generic key-value storage
   - Usage: Last sync timestamps, app settings
```

### Cache Eviction Strategy (LRU)

```
When cache size exceeds limit:
      ↓
Query all audio from IndexedDB
      ↓
Sort by lastAccessedAt (ascending)
      ↓
Calculate total size
      ↓
While totalSize > maxSize:
   └─→ Delete oldest accessed item
   └─→ Subtract from totalSize
      ↓
Stop when under limit
```

## Performance Optimizations

### Client-Side

1. **Code Splitting**: React.lazy() for route-based splitting
2. **Memoization**: useMemo, useCallback for expensive computations
3. **Virtual Scrolling**: For large track lists
4. **Image Optimization**: WebP format, lazy loading, placeholder
5. **Service Worker**: Precache critical assets

### Server-Side

1. **Caching**: Redis for session storage (optional)
2. **Rate Limiting**: Prevent API abuse
3. **Batch Operations**: Firestore batch writes for bulk updates
4. **Connection Pooling**: Reuse HTTP connections
5. **Compression**: Gzip/Brotli response compression

## Monitoring & Logging

### Client-Side

```javascript
// Log to console (development)
console.log('[Audio Cache] Downloading:', trackId);

// Track errors
window.onerror = (msg, url, line, col, error) => {
  // Send to monitoring service
};

// Track performance
performance.mark('audio-cache-start');
// ... cache operation
performance.mark('audio-cache-end');
performance.measure('audio-cache', 'audio-cache-start', 'audio-cache-end');
```

### Server-Side

```javascript
// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Error logging
app.use((err, req, res, next) => {
  console.error('Error:', err);
  // Send to logging service (e.g., Sentry)
});
```

## Scalability Considerations

### Firestore Limits

- **Document Size**: Max 1 MB per document
- **Writes**: 500 writes/second per database
- **Reads**: 10,000 reads/second per database

**Solution**: Batch operations, pagination, query optimization

### IndexedDB Limits

- **Storage Quota**: Varies by browser (usually 50% available disk)
- **Transaction Timeout**: 10 seconds for large operations

**Solution**: Chunked writes, background processing, cache eviction

### Spotify API Rate Limits

- **User Profile**: 5 requests/second
- **Playlists**: 5 requests/second

**Solution**: Token bucket, exponential backoff, caching

## Future Enhancements

1. **WebRTC Sync**: Peer-to-peer audio sharing (local network only)
2. **Background Sync**: Download tracks in background using Background Sync API
3. **Push Notifications**: Notify when new tracks added to playlists
4. **Collaborative Playlists**: Real-time updates with Firestore listeners
5. **Audio Visualizer**: Canvas-based waveform visualization
6. **Lyrics Integration**: Sync lyrics from external API
7. **Social Features**: Share playlists, follow friends
8. **Podcast Support**: Extend to podcast feeds

---

**Last Updated**: December 2025
**Version**: 1.0.0
