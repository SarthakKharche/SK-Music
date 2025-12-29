import admin from 'firebase-admin';

let db: admin.firestore.Firestore;

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment variables
 */
export const initializeFirebase = (): void => {
  try {
    // Parse private key (handle escaped newlines)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });

    db = admin.firestore();
    
    // Configure Firestore to ignore undefined properties
    db.settings({ ignoreUndefinedProperties: true });
    
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    throw error;
  }
};

/**
 * Get Firestore database instance
 */
export const getFirestore = (): admin.firestore.Firestore => {
  if (!db) {
    throw new Error('Firestore not initialized. Call initializeFirebase() first.');
  }
  return db;
};

export { admin };
