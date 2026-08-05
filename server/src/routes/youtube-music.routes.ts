import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { youtubeMusicService } from '../services/youtube-music.service';

const router = Router();

router.get('/home', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.uid;
    const { params } = req.query;
    const result = await youtubeMusicService.fetchHomeFeed(userId, params as string);
    res.json(result);
  } catch (error: any) {
    console.error('[YouTubeMusic] Route error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch YouTube Music feed' });
  }
});

router.get('/playlists/:playlistId', isAuthenticated, async (req: any, res) => {
  try {
    const { playlistId } = req.params;
    const { title } = req.query;
    const playlist = await youtubeMusicService.fetchPlaylist(playlistId, title as string);
    res.json(playlist);
  } catch (error: any) {
    console.error('[YouTubeMusic] Route error fetching playlist:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch YouTube Music playlist' });
  }
});

export default router;
