import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { env } from './env.js';

let credential = applicationDefault();
if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    credential = cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service account JSON');
  }
}

const app = getApps()[0] ?? initializeApp({
  credential,
  projectId: env.FIREBASE_PROJECT_ID,
  ...(env.FIREBASE_STORAGE_BUCKET ? { storageBucket: env.FIREBASE_STORAGE_BUCKET } : {}),
  databaseURL: `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const messaging = getMessaging(app);
export const storage = getStorage(app);