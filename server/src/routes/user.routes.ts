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
    const { trackIds, isOfflinePreferred } = req.body;
    const db = getFirestore();

    if (!Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds must be an array' });
    }

    const batch = db.batch();

    for (const trackId of trackIds) {
      const trackRef = db.collection('tracks').doc(trackId);
      batch.update(trackRef, {
        isOfflinePreferred,
        updatedAt: new Date().toISOString(),
      });
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

export default router;
