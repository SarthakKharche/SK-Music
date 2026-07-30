import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import CryptoJS from 'crypto-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { initializeFirebase, getFirestore } from './src/config/firebase';

function decryptToken(encrypted: string): string {
  const secret = process.env.JWT_SECRET!;
  const bytes = CryptoJS.AES.decrypt(encrypted, secret);
  return bytes.toString(CryptoJS.enc.Utf8);
}

async function run() {
  try {
    initializeFirebase();
    const db = getFirestore();
    const userId = '106204542216238664207';
    const userDoc = await db.collection('users').doc(userId).get();
    const data = userDoc.data();
    if (!data?.googleAccessToken) {
      console.log('No token found');
      process.exit(0);
    }
    const token = decryptToken(data.googleAccessToken);
    
    // ANDROID_MUSIC specific key
    const apiKey = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
    const url = `https://music.youtube.com/youtubei/v1/browse?key=${apiKey}`;
    
    console.log('Sending ANDROID_MUSIC client browse request with OAuth...');
    const response = await axios.post(
      url,
      {
        browseId: 'FEmusic_home',
        context: {
          client: {
            clientName: 'ANDROID_MUSIC',
            clientVersion: '6.14.50',
            hl: 'en',
            gl: 'US',
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    console.log('Success! Response data keys:', Object.keys(response.data));
  } catch (err: any) {
    console.error('Failed:', err.message);
    if (err.response) {
      console.error(JSON.stringify(err.response.data, null, 2));
    }
  }
  process.exit(0);
}

run();
