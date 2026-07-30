import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initializeFirebase } from './src/config/firebase';
import { SpotifyService } from './src/services/spotify.service';

async function run() {
  try {
    initializeFirebase();
    const service = new SpotifyService();
    const userId = '112099132317766770144';
    
    console.log('Attempting to get access token...');
    const token = await service.getUserAccessToken(userId);
    console.log('Success! Token is:', token);
  } catch (err: any) {
    console.error('Failed to get/refresh token:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err);
    }
  }
  process.exit(0);
}

run();
