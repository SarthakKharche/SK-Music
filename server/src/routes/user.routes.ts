import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { getFirestore } from '../config/firebase';
import type { User } from '../types/user.types';

const router = Router();

/**
 * GET /api/user/offline-preferences
 * Get user's offline track preferences
 */
router.get('/offline-preferences', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const db = getFirestore();

    const preferencesSnapshot = await db
      .collection('tracks')
      .where('userId', '==', user.uid)
      .where('isOfflinePreferred', '==', true)
      .get();

    const tracks = preferencesSnapshot.docs.map((doc) => doc.data());

    res.json({ tracks });
  } catch (error) {
    console.error('Error fetching offline preferences:', error);
    res.status(500).json({ error: 'Failed to fetch offline preferences' });
  }
});

/**
 * POST /api/user/offline-preferences
 * Update offline preference for tracks
 */
router.post('/offline-preferences', isAuthenticated, async (req, res) => {
  try {
    const { trackIds, track, isOfflinePreferred } = req.body;
    const user = req.user as User;
    const db = getFirestore();

    if (!Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds must be an array' });
    }

    const batch = db.batch();

    for (const trackId of trackIds) {
      const trackRef = db.collection('tracks').doc(`${user.uid}_${trackId}`);
      const payload: any = {
        id: trackId,
        userId: user.uid,
        isOfflinePreferred: isOfflinePreferred ?? true,
        updatedAt: new Date().toISOString(),
      };

      if (track) {
        payload.name = track.name;
        payload.artists = track.artists;
        payload.album = track.album;
        payload.durationMs = track.durationMs;
        payload.spotifyUrl = track.spotifyUrl;
      }

      batch.set(trackRef, payload, { merge: true });
    }

    await batch.commit();

    return res.json({ 
      message: 'Offline preferences updated',
      count: trackIds.length
    });
  } catch (error) {
    console.error('Error updating offline preferences:', error);
    return res.status(500).json({ error: 'Failed to update offline preferences' });
  }
});

/**
 * GET /api/user/stats
 * Get user statistics
 */
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const db = getFirestore();

    const [playlistsSnapshot, tracksSnapshot, offlineSnapshot] = await Promise.all([
      db.collection('playlists').where('userId', '==', user.uid).get(),
      db.collection('tracks').where('userId', '==', user.uid).get(),
      db.collection('tracks')
        .where('userId', '==', user.uid)
        .where('isOfflinePreferred', '==', true)
        .get(),
    ]);

    res.json({
      playlistCount: playlistsSnapshot.size,
      trackCount: tracksSnapshot.size,
      offlineTrackCount: offlineSnapshot.size,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/user/playlists
 * Get all custom playlists created by the user
 */
router.get('/playlists', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const db = getFirestore();

    const snapshot = await db
      .collection('playlists')
      .where('userId', '==', user.uid)
      .get();

    const playlists = snapshot.docs
      .map((doc) => doc.data())
      .filter((playlist: any) => playlist.id && playlist.id.startsWith('custom_'));

    return res.json({ playlists });
  } catch (error) {
    console.error('Error fetching custom playlists:', error);
    return res.status(500).json({ error: 'Failed to fetch custom playlists' });
  }
});

/**
 * POST /api/user/playlists
 * Create a new custom playlist
 */
router.post('/playlists', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const db = getFirestore();
    const playlistId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    const playlistData = {
      id: playlistId,
      userId: user.uid,
      name,
      description: description || '',
      imageUrl: '',
      trackCount: 0,
      isPublic: false,
      owner: {
        id: user.uid,
        name: user.name || 'User',
      },
      spotifyUrl: '',
      lastSyncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await db.collection('playlists').doc(playlistId).set(playlistData);

    return res.status(201).json({ playlist: playlistData });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return res.status(500).json({ error: 'Failed to create playlist' });
  }
});

/**
 * DELETE /api/user/playlists/:playlistId
 * Delete a custom playlist
 */
router.delete('/playlists/:playlistId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { playlistId } = req.params;
    const db = getFirestore();

    const playlistDoc = await db.collection('playlists').doc(playlistId).get();
    if (!playlistDoc.exists) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlistData = playlistDoc.data();
    if (playlistData?.userId !== user.uid) {
      return res.status(403).json({ error: 'Unauthorized to delete this playlist' });
    }

    // Delete tracks subcollection first
    const tracksSnapshot = await db
      .collection('playlists')
      .doc(playlistId)
      .collection('tracks')
      .get();

    const batch = db.batch();
    tracksSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    batch.delete(db.collection('playlists').doc(playlistId));
    await batch.commit();

    return res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

/**
 * GET /api/user/playlists/:playlistId/tracks
 * Get tracks inside a custom playlist
 */
router.get('/playlists/:playlistId/tracks', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { playlistId } = req.params;
    const db = getFirestore();

    const playlistDoc = await db.collection('playlists').doc(playlistId).get();
    if (!playlistDoc.exists) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlistData = playlistDoc.data();
    if (playlistData?.userId !== user.uid) {
      return res.status(403).json({ error: 'Unauthorized to view this playlist' });
    }

    const tracksSnapshot = await db
      .collection('playlists')
      .doc(playlistId)
      .collection('tracks')
      .get();

    const tracks = tracksSnapshot.docs.map((doc) => doc.data());
    return res.json({ tracks });
  } catch (error) {
    console.error('Error fetching playlist tracks:', error);
    return res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
});

/**
 * POST /api/user/playlists/:playlistId/tracks
 * Add a track to a custom playlist
 */
router.post('/playlists/:playlistId/tracks', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { playlistId } = req.params;
    const { track } = req.body;

    if (!track || !track.id) {
      return res.status(400).json({ error: 'Track details are required' });
    }

    const db = getFirestore();
    const playlistDoc = await db.collection('playlists').doc(playlistId).get();
    if (!playlistDoc.exists) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlistData = playlistDoc.data();
    if (playlistData?.userId !== user.uid) {
      return res.status(403).json({ error: 'Unauthorized to modify this playlist' });
    }

    // Save track in tracks subcollection
    const trackRef = db
      .collection('playlists')
      .doc(playlistId)
      .collection('tracks')
      .doc(track.id);

    await trackRef.set({
      ...track,
      playlistId,
      userId: user.uid,
      addedAt: new Date().toISOString(),
    });

    // Update playlist count
    const tracksSnapshot = await db
      .collection('playlists')
      .doc(playlistId)
      .collection('tracks')
      .get();

    await db.collection('playlists').doc(playlistId).update({
      trackCount: tracksSnapshot.size,
      lastSyncedAt: new Date().toISOString(),
    });

    return res.json({ message: 'Track added to playlist', track });
  } catch (error) {
    console.error('Error adding track to playlist:', error);
    return res.status(500).json({ error: 'Failed to add track to playlist' });
  }
});

/**
 * DELETE /api/user/playlists/:playlistId/tracks/:trackId
 * Remove a track from a custom playlist
 */
router.delete('/playlists/:playlistId/tracks/:trackId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const { playlistId, trackId } = req.params;
    const db = getFirestore();

    const playlistDoc = await db.collection('playlists').doc(playlistId).get();
    if (!playlistDoc.exists) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlistData = playlistDoc.data();
    if (playlistData?.userId !== user.uid) {
      return res.status(403).json({ error: 'Unauthorized to modify this playlist' });
    }

    await db
      .collection('playlists')
      .doc(playlistId)
      .collection('tracks')
      .doc(trackId)
      .delete();

    // Update playlist count
    const tracksSnapshot = await db
      .collection('playlists')
      .doc(playlistId)
      .collection('tracks')
      .get();

    await db.collection('playlists').doc(playlistId).update({
      trackCount: tracksSnapshot.size,
      lastSyncedAt: new Date().toISOString(),
    });

    return res.json({ message: 'Track removed from playlist' });
  } catch (error) {
    console.error('Error removing track from playlist:', error);
    return res.status(500).json({ error: 'Failed to remove track from playlist' });
  }
});

export default router;
