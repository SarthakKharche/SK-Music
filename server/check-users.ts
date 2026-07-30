import dotenv from 'dotenv';
import path from 'path';
// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initializeFirebase, getFirestore } from './src/config/firebase';

async function run() {
  try {
    initializeFirebase();
    const db = getFirestore();
    console.log('Querying users...');
    const usersSnap = await db.collection('users').get();
    console.log(`Found ${usersSnap.size} users:`);
    usersSnap.forEach(doc => {
      const data = doc.data();
      console.log(`- User: ${data.name || data.email} (UID: ${doc.id})`);
      console.log(`  Spotify Connected: ${data.spotifyConnected}`);
      console.log(`  Spotify User ID: ${data.spotifyUserId}`);
      console.log(`  Has Access Token: ${!!data.spotifyAccessToken}`);
      console.log(`  Has Refresh Token: ${!!data.spotifyRefreshToken}`);
      console.log(`  Token Expiry: ${data.spotifyTokenExpiry}`);
    });
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

run();
