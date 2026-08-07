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

let _bucket = null;
let _bucketTried = false;

// The storage bucket, or null. Same contract as the other two: a
// missing bucket is not an error, it is a feature that is off — the
// archive degrades to "this banner lives in your tab", which is
// exactly how the whole product worked before it existed.
//
// The bucket name is the PUBLIC env var deliberately. It is already
// in the browser bundle for the client SDK, it is not a secret, and
// having one name for one bucket beats two that can disagree.
export function getAdminBucket() {
  if (_bucketTried) return _bucket;
  _bucketTried = true;
  const app = getAdminApp();
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!app || !name) return null;
  try {
    const { getStorage } = require("firebase-admin/storage");
    _bucket = getStorage(app).bucket(name);
  } catch (e) {
    console.error("[firebaseAdmin] storage init failed:", e.message);
  }
  return _bucket;
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
