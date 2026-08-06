import axios from 'axios';

export default async function handler(req, res) {
  const { query } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query' });
  }

  const cleanQuery = query.replace(/[\(\)\[\]"'\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const encodedQuery = encodeURIComponent(cleanQuery);

  const saavnEndpoints = [
    `https://saavn.me/api/search/songs?query=${encodedQuery}`,
    `https://jiosaavn-api-private-us.vercel.app/search/songs?query=${encodedQuery}`,
    `https://saavn.dev/api/search/songs?query=${encodedQuery}`,
  ];

  for (const endpoint of saavnEndpoints) {
    try {
      const apiRes = await axios.get(endpoint, { timeout: 4000 });
      const songs = apiRes.data?.data?.results || apiRes.data?.results;
      if (songs && songs.length > 0 && songs[0].downloadUrl) {
        const downloadUrls = songs[0].downloadUrl;
        const highestQual = downloadUrls[downloadUrls.length - 1]?.url || downloadUrls[0]?.url;
        if (highestQual) {
          return res.status(200).json({ url: highestQual, song: songs[0] });
        }
      }
    } catch (e) {
      // Try next endpoint
    }
  }

  return res.status(404).json({ error: 'Song stream not found' });
}
