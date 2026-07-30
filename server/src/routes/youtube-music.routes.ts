import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { youtubeMusicService } from '../services/youtube-music.service';

const router = Router();

router.get('/home', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.uid;
    const shelves = await youtubeMusicService.fetchHomeFeed(userId);
    res.json({ shelves });
  } catch (error: any) {
    console.error('[YouTubeMusic] Route error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch YouTube Music feed' });
  }
});

export default router;
