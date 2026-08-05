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
            gl: 'IN', // India region
          },
        },
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const contents = response.data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    const results = [];
    if (contents && Array.isArray(contents)) {
      for (const section of contents) {
        const shelf = section.musicShelfRenderer || section.itemSectionRenderer;
        if (shelf && shelf.contents && Array.isArray(shelf.contents)) {
          for (const item of shelf.contents) {
            const r = item.musicResponsiveListItemRenderer;
            if (!r) continue;
            const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const subtitleRuns = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
            const creator = subtitleRuns?.[0]?.text || '';
            const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
            const playlistId = navEndpoint?.browseEndpoint?.browseId;
            const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const thumbnail = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url;
            if (playlistId) {
              results.push({ id: playlistId, thumbnail, title, creator });
            }
          }
        }
      }
    }
    return results;
  } catch (e) {
    console.error('Error for query:', query, e.message);
    return [];
  }
}

const queries = [
  "Top Weekly Videos Hindi",
  "Top Weekly Videos Tamil",
  "Top Weekly Videos Punjabi",
  "Trending 20 India",
  "Top Weekly Videos Telugu",
  "Top Weekly Videos Bhojpuri",
  "love Jayashri Vedpathak",
  "1990 super hit sings",
  "Hindi song creative world",
  "smooth song Baskin Robbins",
  "peace AYUSH PAUL",
  "My mediaeval Satpal Rana"
];

async function main() {
  for (const q of queries) {
    console.log(`\nResults for query: "${q}"`);
    const list = await searchPlaylists(q);
    // Print top 3 results
    for (let i = 0; i < Math.min(3, list.length); i++) {
      const item = list[i];
      console.log(`  [${i+1}] Title: "${item.title}" | Creator: "${item.creator}" | id: "${item.id}" | thumbnail: "${item.thumbnail}"`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

main();
