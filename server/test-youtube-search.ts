import axios from 'axios';
import fs from 'fs';

async function run() {
  const apiKey = 'AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE';
  const url = `https://music.youtube.com/youtubei/v1/search?key=${apiKey}`;
  
  try {
    console.log('Sending search request to YouTube Music...');
    const response = await axios.post(
      url,
      {
        query: 'Taylor Swift',
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
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    console.log('Success! Keys:', Object.keys(response.data));
    const outPath = 'C:\\Users\\sarth\\.gemini\\antigravity-cli\\brain\\d7f7fe14-b35e-4541-b073-f1054e356cae\\scratch\\youtube-search.json';
    fs.writeFileSync(outPath, JSON.stringify(response.data, null, 2));
    console.log('Wrote search results to:', outPath);
  } catch (err: any) {
    console.error('Failed:', err.message);
    if (err.response) {
      console.error(JSON.stringify(err.response.data, null, 2));
    }
  }
  process.exit(0);
}

run();
