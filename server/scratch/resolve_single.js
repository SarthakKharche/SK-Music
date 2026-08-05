const axios = require('axios');

const apiKey = 'AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE';
const innerTubeUrl = 'https://music.youtube.com/youtubei/v1';

async function main() {
  try {
    const response = await axios.post(
      `${innerTubeUrl}/browse?key=${apiKey}`,
      {
        browseId: 'VLRDCLAK5uy_n93B_MvN0E4U51c4r7YvN0Bw9E4y5t_wE',
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

    const header = response.data.header?.musicHeaderRenderer || 
                   response.data.header?.musicDetailHeaderRenderer || 
                   response.data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;
    
    let imageUrl = '';
    if (header) {
      const thumbnails = header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      if (thumbnails && thumbnails.length > 0) {
        imageUrl = thumbnails[thumbnails.length - 1].url;
      }
    }
    
    console.log('Title:', response.data.header?.musicDetailHeaderRenderer?.title?.runs?.[0]?.text);
    console.log('Resolved Thumbnail URL:', imageUrl);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
