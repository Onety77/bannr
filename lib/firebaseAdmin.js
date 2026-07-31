// Server-only Firebase Admin. Returns null until configured —
// every caller degrades gracefully (demo mode) instead of crashing.
import "server-only";

let _app = null;
let _appTried = false;

function getAdminApp() {
  if (_appTried) return _app;
  _appTried = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    // lazy require so builds don't need credentials
    const { initializeApp, cert, getApps } = require("firebase-admin/app");
    _app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (e) {
    console.error("[firebaseAdmin] init failed:", e.message);
    _app = null;
  }
  return _app;
}

let _db = null;
let _dbTried = false;

export function getAdminDb() {
  if (_dbTried) return _db;
  _dbTried = true;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const { getFirestore } = require("firebase-admin/firestore");
    _db = getFirestore(app);
  } catch (e) {
    console.error("[firebaseAdmin] firestore init failed:", e.message);
  }
  return _db;
}

let _auth = null;
let _authTried = false;

export function getAdminAuth() {
  if (_authTried) return _auth;
  _authTried = true;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const { getAuth } = require("firebase-admin/auth");
    _auth = getAuth(app);
  } catch (e) {
    console.error("[firebaseAdmin] auth init failed:", e.message);
  }
  return _auth;
}
