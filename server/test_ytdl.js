const ytdl = require('@distube/ytdl-core');

async function test() {
  try {
    console.log('Testing @distube/ytdl-core for zAiIgYOH4Ys...');
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=zAiIgYOH4Ys');
    const formats = ytdl.filterFormats(info.formats, 'audioonly');
    console.log('Found audio formats:', formats.length);
    if (formats.length > 0) {
      console.log('Best audio URL:', formats[0].url.substring(0, 100));
    }
  } catch (err) {
    console.error('YTDL Error:', err);
  }
}

test();
