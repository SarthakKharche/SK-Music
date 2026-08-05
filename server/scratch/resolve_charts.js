const axios = require('axios');

const apiKey = 'AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE';
const innerTubeUrl = 'https://music.youtube.com/youtubei/v1';

async function main() {
  try {
    const response = await axios.post(
      `${innerTubeUrl}/browse?key=${apiKey}`,
      {
        browseId: 'FEmusic_charts',
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'IN', // IMPORTANT: Use India region to get Indian Pop and Indian Charts!
          },
        },
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const contents = response.data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    if (contents) {
      console.log('Found sections:', contents.length);
      for (const section of contents) {
        const shelf = section.musicCarouselShelfRenderer || section.musicShelfRenderer;
        if (!shelf) continue;
        
        let title = '';
        if (shelf.header?.musicHeaderRenderer?.title?.runs?.[0]?.text) {
          title = shelf.header.musicHeaderRenderer.title.runs[0].text;
        } else if (shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text) {
          title = shelf.header.musicCarouselShelfBasicHeaderRenderer.title.runs[0].text;
        }
        
        console.log(`\n--- Shelf: ${title} ---`);
        if (shelf.contents) {
          for (const item of shelf.contents) {
            const r = item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer;
            if (!r) continue;
            
            let itemTitle = '';
            if (r.title?.runs?.[0]?.text) {
              itemTitle = r.title.runs[0].text;
            } else if (r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) {
              itemTitle = r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text;
            }
            
            const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
            const id = navEndpoint?.browseEndpoint?.browseId || navEndpoint?.watchPlaylistEndpoint?.playlistId;
            
            const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const thumbnail = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url;
            
            console.log(`  "${itemTitle}": { id: "${id}", thumbnail: "${thumbnail}" }`);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error fetching charts:', e.message);
  }
}

main();
