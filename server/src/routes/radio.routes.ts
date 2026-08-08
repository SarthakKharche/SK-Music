import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

/**
 * GET /api/radio/recommendations
 * Fetch autoplay recommended tracks similar to a given track
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const rawTrackId = (req.query.trackId as string) || '';
    const trackName = (req.query.trackName as string) || '';
    const artistName = (req.query.artistName as string) || '';

    const cleanTitle = trackName.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const primaryArtist = artistName.split(',')[0].split('&')[0].trim();
    const searchQuery = encodeURIComponent(`${primaryArtist || cleanTitle} top hits`);

    console.log(`[AUTOPLAY RADIO] Fetching recommendations for: ${cleanTitle} by ${primaryArtist}`);

    let recommendedTracks: any[] = [];

    // Attempt 1: JioSaavn Search by Artist / Genre
    try {
      const searchRes = await axios.get(`https://jiosaavn-api-private.vercel.app/search/songs?query=${searchQuery}`, { timeout: 5000 });
      const results = searchRes.data?.data?.results || searchRes.data?.results || [];

      if (results && results.length > 0) {
        recommendedTracks = results
          .filter((item: any) => item.id !== rawTrackId && item.name)
          .slice(0, 10)
          .map((item: any) => ({
            id: item.id.startsWith('yt-') ? item.id : `yt-${item.id}`,
            name: item.name || item.title,
            artists: Array.isArray(item.primaryArtists)
              ? item.primaryArtists
              : [{ id: 'artist-1', name: item.subtitle || item.artist || primaryArtist || 'Various Artists' }],
            album: {
              id: item.album?.id || 'album-1',
              name: item.album?.name || item.name || 'Single',
              imageUrl: item.image?.[2]?.link || item.image?.[1]?.link || item.image?.[0]?.link || item.image || '/placeholder-album.png',
            },
            durationMs: parseInt(item.duration, 10) * 1000 || 180000,
            spotifyUrl: item.url || '',
          }));
      }
    } catch (jioErr) {
      console.warn('[AUTOPLAY RADIO] JioSaavn recommendation search skipped:', jioErr);
    }

    // Fallback: If JioSaavn returned 0, search for cleanTitle
    if (recommendedTracks.length === 0 && cleanTitle) {
      try {
        const titleRes = await axios.get(`https://jiosaavn-api-private.vercel.app/search/songs?query=${encodeURIComponent(cleanTitle)}`, { timeout: 5000 });
        const results = titleRes.data?.data?.results || titleRes.data?.results || [];

        if (results && results.length > 0) {
          recommendedTracks = results
            .filter((item: any) => item.id !== rawTrackId && item.name)
            .slice(0, 10)
            .map((item: any) => ({
              id: item.id.startsWith('yt-') ? item.id : `yt-${item.id}`,
              name: item.name || item.title,
              artists: Array.isArray(item.primaryArtists)
                ? item.primaryArtists
                : [{ id: 'artist-1', name: item.subtitle || item.artist || 'Various Artists' }],
              album: {
                id: item.album?.id || 'album-1',
                name: item.album?.name || item.name || 'Single',
                imageUrl: item.image?.[2]?.link || item.image?.[1]?.link || item.image?.[0]?.link || item.image || '/placeholder-album.png',
              },
              durationMs: parseInt(item.duration, 10) * 1000 || 180000,
              spotifyUrl: item.url || '',
            }));
        }
      } catch {}
    }

    return res.json({ tracks: recommendedTracks });
  } catch (error) {
    console.error('[AUTOPLAY RADIO] Error fetching recommendations:', error);
    return res.json({ tracks: [] });
  }
});

export default router;
