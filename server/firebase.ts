import * as admin from 'firebase-admin';

// Initialize Firebase Admin
// We expect the service account key to be provided via environment variables
// or for the code to be running in a Google Cloud environment (like Cloud Run)
// where it can use Application Default Credentials.

if (!admin.apps.length) {
  try {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || 'years-of-j'
      });
      console.log('Firebase Admin initialized in Emulator Mode');
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      console.log('Firebase Admin initialized with Application Default Credentials');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

export const db = admin.firestore();
