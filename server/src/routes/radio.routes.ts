import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// Spotify & YouTube Music Style Related Artist Map
const RELATED_ARTIST_MAP: Record<string, string[]> = {
  // English Pop / International
  'charlie puth': ['Selena Gomez', 'Shawn Mendes', 'Ed Sheeran', 'Justin Bieber', 'Dua Lipa', 'Camila Cabello', 'Maroon 5', 'Taylor Swift', 'Katy Perry', 'Ariana Grande', 'Lauv', 'Bazzi'],
  'katy perry': ['Taylor Swift', 'Ariana Grande', 'Lady Gaga', 'Rihanna', 'Dua Lipa', 'Selena Gomez', 'Beyoncé', 'Britney Spears', 'Miley Cyrus', 'P!nk'],
  'selena gomez': ['Charlie Puth', 'Demi Lovato', 'Ariana Grande', 'Taylor Swift', 'Camila Cabello', 'Dua Lipa', 'Shawn Mendes', 'Bebe Rexha'],
  'ed sheeran': ['Shawn Mendes', 'James Arthur', 'Lewis Capaldi', 'Justin Bieber', 'One Direction', 'Coldplay', 'Sam Smith', 'Charlie Puth'],
  'one direction': ['Zayn', 'Harry Styles', 'Niall Horan', '5 Seconds of Summer', 'The Vamps', 'Shawn Mendes', 'Ed Sheeran', 'Little Mix'],
  'justin bieber': ['Shawn Mendes', 'Charlie Puth', 'The Weeknd', 'Post Malone', 'Drake', 'Zedd', 'DJ Snake', 'Kygo'],
  
  // Hindi / Bollywood / Indian Pop
  'arijit singh': ['Shreya Ghoshal', 'Pritam', 'Atif Aslam', 'Mohit Chauhan', 'Jubin Nautiyal', 'KK', 'Sonu Nigam', 'Vishal Mishra', 'B Praak', 'Darshan Raval'],
  'shreya ghoshal': ['Arijit Singh', 'Sunidhi Chauhan', 'Shaan', 'Sonu Nigam', 'Neeti Mohan', 'Alka Yagnik', 'Javed Ali', 'Pritam'],
  'atif aslam': ['Arijit Singh', 'Rahat Fateh Ali Khan', 'Mohit Chauhan', 'KK', 'Mustafa Zahid', 'Ali Zafar', 'Ankit Tiwari'],
  'pritam': ['Arijit Singh', 'Vishal-Shekhar', 'Shankar-Ehsaan-Loy', 'Sachin-Jigar', 'Amit Trivedi', 'Mithoon', 'M.M. Keeravani'],
  'banjaare': ['Shreya Ghoshal', 'Arijit Singh', 'Sachin-Jigar', 'Mithoon', 'Jubin Nautiyal', 'Jasleen Royal'],

  // Punjabi / Hip-Hop
  'sidhu moose wala': ['Karan Aujla', 'AP Dhillon', 'Diljit Dosanjh', 'Shubh', 'Gurinder Gill', 'Gippy Grewal', 'Ammy Virk', 'Bohemia'],
  'ap dhillon': ['Gurinder Gill', 'Shubh', 'Karan Aujla', 'Diljit Dosanjh', 'Sidhu Moose Wala', 'Intense', 'Talwiinder'],
};

/**
 * GET /api/radio/recommendations
 * Fetch 20+ Spotify/YT Music style radio recommendations
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const rawTrackId = (req.query.trackId as string) || '';
    const trackName = (req.query.trackName as string) || '';
    const artistName = (req.query.artistName as string) || '';
    const albumName = (req.query.albumName as string) || '';

    const cleanTitle = trackName.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanAlbum = albumName.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const artistList = artistName.split(/[,&]/).map(a => a.trim()).filter(Boolean);
    const primaryArtist = artistList[0] || '';
    const secondaryArtist = artistList[1] || '';
    const primaryArtistKey = primaryArtist.toLowerCase();

    console.log(`[AUTOPLAY RADIO] Generating contextual queue for: "${cleanTitle}" | Album: "${cleanAlbum}" | Artist: "${primaryArtist}"`);

    const normalize = (str: string) => (str || '').toLowerCase().replace(/[\(\)\[\]"'\-_feat\.]/g, '').replace(/\s+/g, ' ').trim();
    const seenTitles = new Set<string>();
    if (cleanTitle) seenTitles.add(normalize(cleanTitle));

    // Helper to fetch songs for a query
    const fetchCandidateSongs = async (query: string): Promise<any[]> => {
      if (!query || query.length < 2) return [];
      try {
        const searchUrl = `https://jiosaavn-api-private.vercel.app/search/songs?q=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, { timeout: 4000 });
        const results = searchRes.data?.data?.results || searchRes.data?.results || [];
        return Array.isArray(results) ? results : [];
      } catch {
        return [];
      }
    };

    const convertToTrack = (item: any) => {
      const itemName = item.name || item.title || '';
      const rawImg = Array.isArray(item.image)
        ? (item.image[2]?.link || item.image[1]?.link || item.image[0]?.link || item.image[0]?.url)
        : (item.image || '/placeholder-album.png');

      const itemArtists = typeof item.primaryArtists === 'string'
        ? item.primaryArtists
        : (Array.isArray(item.primaryArtists) ? item.primaryArtists.map((a: any) => a.name).join(', ') : (item.subtitle || primaryArtist));

      return {
        id: item.id.startsWith('yt-') ? item.id : `yt-${item.id}`,
        name: itemName,
        artists: [{ id: 'artist-1', name: itemArtists }],
        album: {
          id: item.album?.id || 'album-1',
          name: item.album?.name || itemName || 'Single',
          imageUrl: rawImg,
        },
        durationMs: (parseInt(item.duration, 10) || 180) * 1000,
        spotifyUrl: item.url || '',
        playlistId: '',
        userId: '',
        explicit: false,
        isOfflinePreferred: false,
        addedAt: new Date().toISOString(),
      };
    };

    const albumBucket: any[] = [];
    const artistBucket: any[] = [];
    const relatedBucket: any[] = [];

    // Tier 1: Same Album / Movie Soundtrack
    if (cleanAlbum && cleanAlbum.toLowerCase() !== 'single' && cleanAlbum.toLowerCase() !== 'unknown album') {
      const albumResults = await fetchCandidateSongs(`${cleanAlbum} ${primaryArtist}`);
      const shuffledAlbum = [...albumResults].sort(() => Math.random() - 0.5);
      for (const item of shuffledAlbum) {
        const itemName = item.name || item.title || '';
        const normTitle = normalize(itemName);
        if (!itemName || seenTitles.has(normTitle)) continue;
        if (item.id === rawTrackId || item.id === `yt-${rawTrackId}`) continue;

        seenTitles.add(normTitle);
        albumBucket.push(convertToTrack(item));
        if (albumBucket.length >= 6) break;
      }
    }

    // Tier 2: Same Primary Artist & Secondary Artist Hits
    if (primaryArtist) {
      const artistResults = await fetchCandidateSongs(`${primaryArtist} top songs`);
      const shuffledArtist = [...artistResults].sort(() => Math.random() - 0.5);
      for (const item of shuffledArtist) {
        const itemName = item.name || item.title || '';
        const normTitle = normalize(itemName);
        if (!itemName || seenTitles.has(normTitle)) continue;
        if (item.id === rawTrackId || item.id === `yt-${rawTrackId}`) continue;

        seenTitles.add(normTitle);
        artistBucket.push(convertToTrack(item));
        if (artistBucket.length >= 8) break;
      }
    }

    // Tier 3: Mapped Related Artists & Genre Radio
    const mappedRelated = RELATED_ARTIST_MAP[primaryArtistKey] || [];
    const searchQueries: string[] = [];
    if (secondaryArtist) searchQueries.push(secondaryArtist);
    if (cleanTitle) searchQueries.push(`${cleanTitle} radio`);
    if (mappedRelated.length > 0) {
      searchQueries.push(...[...mappedRelated].sort(() => Math.random() - 0.5).slice(0, 4));
    } else {
      searchQueries.push(`similar to ${primaryArtist}`);
    }

    for (const q of searchQueries) {
      const relResults = await fetchCandidateSongs(q);
      const shuffledRel = [...relResults].sort(() => Math.random() - 0.5);
      for (const item of shuffledRel) {
        const itemName = item.name || item.title || '';
        const normTitle = normalize(itemName);
        if (!itemName || seenTitles.has(normTitle)) continue;
        if (item.id === rawTrackId || item.id === `yt-${rawTrackId}`) continue;

        seenTitles.add(normTitle);
        relatedBucket.push(convertToTrack(item));
        if (relatedBucket.length >= 12) break;
      }
      if (relatedBucket.length >= 12) break;
    }

    // Smart Interleaving: Interleave Album -> Artist -> Related
    const finalQueue: any[] = [];
    const maxLen = Math.max(albumBucket.length, artistBucket.length, relatedBucket.length);

    for (let i = 0; i < maxLen; i++) {
      if (i < albumBucket.length) finalQueue.push(albumBucket[i]);
      if (i < artistBucket.length) finalQueue.push(artistBucket[i]);
      if (i < relatedBucket.length) finalQueue.push(relatedBucket[i]);
    }

    console.log(`[AUTOPLAY RADIO] Generated ${finalQueue.length} prioritized tracks (Album: ${albumBucket.length}, Artist: ${artistBucket.length}, Related: ${relatedBucket.length})`);
    return res.json({ tracks: finalQueue });
  } catch (error) {
    console.error('[AUTOPLAY RADIO] Error generating radio:', error);
    return res.json({ tracks: [] });
  }
});

export default router;
