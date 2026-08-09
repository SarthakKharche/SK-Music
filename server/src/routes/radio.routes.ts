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

const DEFAULT_ENGLISH_RADIO = ['Charlie Puth', 'Selena Gomez', 'Shawn Mendes', 'Ed Sheeran', 'Dua Lipa', 'Taylor Swift', 'Katy Perry', 'Justin Bieber', 'Maroon 5', 'Ariana Grande', 'The Weeknd', 'Coldplay'];
const DEFAULT_HINDI_RADIO = ['Arijit Singh', 'Shreya Ghoshal', 'Pritam', 'Atif Aslam', 'Jubin Nautiyal', 'KK', 'Sonu Nigam', 'Vishal Mishra', 'B Praak', 'Darshan Raval', 'Jasleen Royal', 'Sachin-Jigar'];

/**
 * GET /api/radio/recommendations
 * Fetch 20+ Spotify/YT Music style radio recommendations
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const rawTrackId = (req.query.trackId as string) || '';
    const trackName = (req.query.trackName as string) || '';
    const artistName = (req.query.artistName as string) || '';

    const cleanTitle = trackName.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const artistList = artistName.split(/[,&]/).map(a => a.trim()).filter(Boolean);
    const primaryArtist = artistList[0] || '';
    const primaryArtistKey = primaryArtist.toLowerCase();

    console.log(`[AUTOPLAY RADIO] Generating Spotify/YT Music radio queue for: "${cleanTitle}" by "${primaryArtist}"`);

    // Determine related artists
    let relatedArtists = RELATED_ARTIST_MAP[primaryArtistKey] || [];
    const isEnglish = /[a-zA-Z]/.test(cleanTitle || primaryArtist) && !/[\u0900-\u097F]/.test(cleanTitle || primaryArtist);

    if (relatedArtists.length === 0) {
      relatedArtists = isEnglish ? DEFAULT_ENGLISH_RADIO : DEFAULT_HINDI_RADIO;
    }

    // Pick 4-6 distinct target artists to query
    const targetArtists = Array.from(new Set([
      primaryArtist,
      ...artistList,
      ...relatedArtists.sort(() => Math.random() - 0.5).slice(0, 5)
    ])).filter(Boolean);

    let candidateTracks: any[] = [];
    const seenTitles = new Set<string>();

    const normalize = (str: string) => (str || '').toLowerCase().replace(/[\(\)\[\]"'\-_feat\.]/g, '').replace(/\s+/g, ' ').trim();
    if (cleanTitle) seenTitles.add(normalize(cleanTitle));

    for (const artist of targetArtists) {
      try {
        const searchUrl = `https://jiosaavn-api-private.vercel.app/search/songs?q=${encodeURIComponent(artist)}`;
        const searchRes = await axios.get(searchUrl, { timeout: 4000 });
        const results = searchRes.data?.data?.results || searchRes.data?.results || [];

        if (Array.isArray(results) && results.length > 0) {
          const shuffled = [...results].sort(() => Math.random() - 0.5);

          for (const item of shuffled) {
            const itemName = item.name || item.title || '';
            const normTitle = normalize(itemName);

            if (!itemName || seenTitles.has(normTitle)) continue;
            if (item.id === rawTrackId || item.id === `yt-${rawTrackId}`) continue;

            seenTitles.add(normTitle);

            const rawImg = Array.isArray(item.image)
              ? (item.image[2]?.link || item.image[1]?.link || item.image[0]?.link || item.image[0]?.url)
              : (item.image || '/placeholder-album.png');

            const itemArtists = typeof item.primaryArtists === 'string'
              ? item.primaryArtists
              : (Array.isArray(item.primaryArtists) ? item.primaryArtists.map((a: any) => a.name).join(', ') : (item.subtitle || artist));

            candidateTracks.push({
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
            });

            if (candidateTracks.length >= 25) break;
          }
        }
      } catch (err) {
        console.warn(`[AUTOPLAY RADIO] Query failed for artist: ${artist}`, err);
      }

      if (candidateTracks.length >= 25) break;
    }

    console.log(`[AUTOPLAY RADIO] Generated ${candidateTracks.length} diverse radio tracks for "${cleanTitle}"`);
    return res.json({ tracks: candidateTracks });
  } catch (error) {
    console.error('[AUTOPLAY RADIO] Error generating radio:', error);
    return res.json({ tracks: [] });
  }
});

export default router;
