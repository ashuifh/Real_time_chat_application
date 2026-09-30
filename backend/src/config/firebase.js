import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple sources for credentials
function loadCredential() {
  // Priority 1: Environment variable (for deployment like Render)
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON && env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    console.log('🔑 Loading Firebase credentials from ENV variable');
    return cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  // Priority 2: serviceAccountKey.json file (for local dev)
  const keyPath = join(__dirname, '../../serviceAccountKey.json');
  if (existsSync(keyPath)) {
    console.log('🔑 Loading Firebase credentials from serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    return cert(serviceAccount);
  }

  // Priority 3: Fallback to application default (not recommended)
  console.warn('⚠️ No service account found, using application default');
  throw new Error(
    'Firebase credentials not found. Please either:\n' +
    '1. Set FIREBASE_SERVICE_ACCOUNT_JSON in .env, OR\n' +
    '2. Place serviceAccountKey.json in backend/ folder'
  );
}

const app = getApps()[0] ?? initializeApp({
  credential: loadCredential(),
  projectId: env.FIREBASE_PROJECT_ID,
  ...(env.FIREBASE_STORAGE_BUCKET ? { storageBucket: env.FIREBASE_STORAGE_BUCKET } : {}),
  databaseURL: env.FIREBASE_DATABASE_URL ?? `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const messaging = getMessaging(app);
export const storage = getStorage(app);