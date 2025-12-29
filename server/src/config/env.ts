import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Attempt to load .env from multiple likely locations
const candidates = [
  path.resolve(process.cwd(), '.env'), // workspace cwd (may be server/)
  path.resolve(__dirname, '../../../.env'), // repo root from src/config
  path.resolve(__dirname, '../../.env'), // from src -> server/.env
  path.resolve(__dirname, '../.env'), // from config -> src/.env
];

let loadedFrom: string | null = null;
for (const p of candidates) {
  try {
    if (fs.existsSync(p)) {
      const result = dotenv.config({ path: p });
      if (!result.error) {
        loadedFrom = p;
        break;
      }
    }
  } catch {
    // ignore
  }
}

if (!loadedFrom) {
  const fallback = path.resolve(process.cwd(), '.env');
  const result = dotenv.config({ path: fallback });
  if (!result.error) {
    loadedFrom = fallback;
    console.log(`ENV: loaded from ${loadedFrom}`);
  } else {
    console.warn('ENV: .env not found in known locations; loaded default process env');
  }
} else {
  console.log(`ENV: loaded from ${loadedFrom}`);
}
