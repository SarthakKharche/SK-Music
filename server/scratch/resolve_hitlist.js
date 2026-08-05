const axios = require('axios');

const apiKey = 'AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE';
const innerTubeUrl = 'https://music.youtube.com/youtubei/v1';

async function main() {
  try {
    const response = await axios.post(
      `${innerTubeUrl}/search?key=${apiKey}`,
      {
        query: "Bollywood Romance Hitlist",
        params: 'Eg-KAQwIADABGgQIAhAB', // Filter to Playlists
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'IN',
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
          for (let i = 0; i < shelf.contents.length; i++) {
            const r = shelf.contents[i].musicResponsiveListItemRenderer;
            if (!r) continue;
            const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const creator = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
            const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
            const id = navEndpoint?.browseEndpoint?.browseId;
            const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const thumbnail = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url;
            console.log(`[${i+1}] Title: "${title}" | Creator: "${creator}" | id: "${id}" | thumbnail: "${thumbnail}"`);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
