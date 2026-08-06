import axios from 'axios';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing YouTube ID' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'audio/mp4');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const streamSources = [
    `https://yewtu.be/latest_version?id=${id}&itag=140`,
    `https://invidious.nerdvpn.de/latest_version?id=${id}&itag=140`,
    `https://invidious.jing.rocks/latest_version?id=${id}&itag=140`,
  ];

  for (const sourceUrl of streamSources) {
    try {
      const streamRes = await axios.get(sourceUrl, {
        responseType: 'stream',
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (streamRes.status >= 200 && streamRes.status < 300) {
        if (streamRes.headers['content-length']) {
          res.setHeader('Content-Length', streamRes.headers['content-length']);
        }
        streamRes.data.pipe(res);
        return;
      }
    } catch (e) {
      // Try next mirror
    }
  }

  return res.status(500).json({ error: 'Audio stream download failed' });
}
