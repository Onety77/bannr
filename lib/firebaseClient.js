// Client Firebase — Auth only. Nothing here reads or writes data; all
// of that goes through server routes on the Admin SDK.
// Null until NEXT_PUBLIC_FIREBASE_* env vars are set.
"use client";
import { initializeApp, getApps } from "firebase/app";

// ------------------------------------------------------------
// authDomain is OUR OWN ORIGIN, not <project>.firebaseapp.com.
//
// This is the single fix for mobile sign-in, on both iOS and Android.
// With the default domain, finishing a sign-in means the credential
// has to travel from firebaseapp.com back to our origin. Every current
// mobile browser treats that as third-party storage and blocks it — so
// the redirect completes, the user comes back, and they are still
// signed out with nothing to explain why. That is exactly what was
// happening.
//
// Pointing authDomain at our own host makes the whole exchange
// same-origin, and next.config.mjs proxies /__/auth/* through to
// Firebase's handler so the helper is genuinely served from here. This
// is Firebase's own documented answer, not a trick.
//
// It also removes the odd detour through a bannr-c188f.firebaseapp.com
// URL that users could see in the address bar. Sign-in now goes to
// accounts.google.com and straight back here, like any other site.
//
// Derived at call time rather than from an env var so it is correct on
// localhost, on the vercel.app domain, and on a custom domain later,
// with nothing to remember to change. The env var remains the fallback
// for any non-browser context.
// ------------------------------------------------------------
function authDomain() {
  if (typeof window !== "undefined" && window.location?.host) {
    return window.location.host;
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
}

export function getFirebase() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const config = {
    apiKey,
    authDomain: authDomain(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  return getApps()[0] || initializeApp(config);
}
