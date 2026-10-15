import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const missingFirebaseConfig = [
  ["VITE_FIREBASE_API_KEY", requiredConfig.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", requiredConfig.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", requiredConfig.projectId],
  ["VITE_FIREBASE_DATABASE_URL", requiredConfig.databaseURL],
  ["VITE_FIREBASE_APP_ID", requiredConfig.appId]
].filter(([, value]) => !value).map(([key]) => key);

const firebaseApp = missingFirebaseConfig.length === 0
  ? initializeApp(requiredConfig)
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const database = firebaseApp ? getDatabase(firebaseApp) : null;
