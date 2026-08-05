const axios = require('axios');

const apiKey = 'AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE';
const innerTubeUrl = 'https://music.youtube.com/youtubei/v1';

async function searchPlaylists(query) {
  try {
    const response = await axios.post(
      `${innerTubeUrl}/search?key=${apiKey}`,
      {
        query: query,
        params: 'Eg-KAQwIADABGgQIAhAB', // Filter to Playlists
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const contents = response.data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    if (contents && Array.isArray(contents)) {
      for (const section of contents) {
        const shelf = section.musicShelfRenderer || section.itemSectionRenderer;
        if (shelf && shelf.contents && Array.isArray(shelf.contents)) {
          for (const item of shelf.contents) {
            const r = item.musicResponsiveListItemRenderer;
            if (!r) continue;
            const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
            const playlistId = navEndpoint?.browseEndpoint?.browseId;
            const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const thumbnail = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url;
            if (playlistId) {
              return { id: playlistId, thumbnail, title };
            }
          }
        }
      }
    }
    return null;
  } catch (e) {
    console.error('Error for query:', query, e.message);
    return null;
  }
}

async function searchAlbums(query) {
  try {
    const response = await axios.post(
      `${innerTubeUrl}/search?key=${apiKey}`,
      {
        query: query,
        params: 'EgWKAQIYAWoKEAkQBRAKEAMQHg%3D%3D', // Filter to Albums
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const contents = response.data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    if (contents && Array.isArray(contents)) {
      for (const section of contents) {
        const shelf = section.musicShelfRenderer || section.itemSectionRenderer;
        if (shelf && shelf.contents && Array.isArray(shelf.contents)) {
          for (const item of shelf.contents) {
            const r = item.musicResponsiveListItemRenderer;
            if (!r) continue;
            const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
            const albumId = navEndpoint?.browseEndpoint?.browseId;
            const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const thumbnail = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url;
            if (albumId) {
              return { id: albumId, thumbnail, title };
            }
          }
        }
      }
    }
    return null;
  } catch (e) {
    console.error('Error for query:', query, e.message);
    return null;
  }
}

const playlistsToResolve = [
  "Bollywood Romantic Moments",
  "Uncut Bollywood",
  "80s Bollywood Romance",
  "00s Bollywood Romance",
  "Ishq Sufiyana",
  "Bollywood Romance Hitlist",
  "Punjabi Hip Hop Hits",
  "Easy Mornings: Hindi",
  "Upbeat Bollywood",
  "Bhajan Clubbing",
  "Pump-Up Pop",
  "Singing in the Shower: Hindi",
  "love playlist",
  "1990 super hit sings",
  "Hindi song",
  "smooth song",
  "peace",
  "My mediaeval",
  "Bollywood Fire",
  "Bollywood Party",
  "Punjabi Party",
  "Bollywood Recharger",
  "90s Bollywood Dance",
  "10s Bollywood Dance",
  "Top Weekly Videos Hindi",
  "Top Weekly Videos Tamil",
  "Top Weekly Videos Punjabi",
  "Trending 20 India",
  "Top Weekly Videos Telugu",
  "Top Weekly Videos Bhojpuri"
];

const albumsToResolve = [
  "Hit Songs Malayalam",
  "Barsaat X Spider-Man",
  "Boohe Baarian",
  "Main Neevan Mera Murshad Ucha",
  "petal Ariana Grande",
  "Gehra Hua Afro Mix"
];

async function main() {
  const results = {};
  
  console.log('--- RESOLVING PLAYLISTS ---');
  for (const p of playlistsToResolve) {
    const res = await searchPlaylists(p);
    if (res) {
      results[p] = res;
      console.log(`"${p}": { id: "${res.id}", thumbnail: "${res.thumbnail}" },`);
    } else {
      console.log(`Failed to resolve playlist: ${p}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('--- RESOLVING ALBUMS ---');
  for (const a of albumsToResolve) {
    const res = await searchAlbums(a);
    if (res) {
      results[a] = res;
      console.log(`"${a}": { id: "${res.id}", thumbnail: "${res.thumbnail}" },`);
    } else {
      console.log(`Failed to resolve album: ${a}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

main();
