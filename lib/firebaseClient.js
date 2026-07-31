// Client Firebase (Auth for Google sign-in, Firestore for user data).
// Null until NEXT_PUBLIC_FIREBASE_* env vars are set — the app runs
// in demo mode (localStorage) without it.
"use client";
import { initializeApp, getApps } from "firebase/app";

export function getFirebase() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const config = {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  return getApps()[0] || initializeApp(config);
}
