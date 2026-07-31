// ============================================================
// WALLET AUTH — sign a message, get a session.
//
// The wallet is the KEY, not the vault. The account itself lives in
// Firestore (see lib/users.js); a signature only proves you may open
// it. That's what makes credits and history survive a cleared
// browser, a new laptop, or eight months away — exactly like an
// email account would.
//
// Flow:
//   1. client asks for a nonce           POST /api/auth/nonce
//   2. wallet signs a human-readable message containing it
//   3. server verifies the Ed25519 signature and burns the nonce
//   4. server sets a signed, httpOnly session cookie
//
// WHY A JWT COOKIE, NOT A FIREBASE CUSTOM TOKEN: this works whether
// or not Firebase is reachable, needs no client-side Firebase SDK,
// and keeps sign-in independent of Firestore being up. Firebase
// stores the account; it doesn't gate getting into it. Admin auth
// stays on Firebase ID tokens (lib/adminAuth.js) — different
// audience, different mechanism, deliberately not shared.
//
// The message is deliberately readable in the wallet popup, and
// says plainly that it authorises no transaction. A signature
// request that looks inscrutable is how people get drained, and a
// paying user has every right to be suspicious of one.
// ============================================================
import "server-only";
import crypto from "crypto";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const SESSION_COOKIE = "bannr_session";
const SESSION_DAYS = 30;
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes to sign

// ---------- nonces ----------
// Single-use and short-lived, so a captured signature can't be
// replayed. Firestore when available; an in-memory Map otherwise so
// local dev works before Firebase is configured. The Map is fine to
// lose on restart — worst case someone re-clicks Connect.
const memNonces = new Map();

function sweepMemory() {
  const now = Date.now();
  for (const [k, v] of memNonces) if (v.expires < now) memNonces.delete(k);
}

export async function issueNonce(wallet) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expires = Date.now() + NONCE_TTL_MS;
  const db = getAdminDb();
  if (db) {
    await db.collection("nonces").doc(nonce).set({ wallet, expires });
  } else {
    sweepMemory();
    memNonces.set(nonce, { wallet, expires });
  }
  return nonce;
}

// Returns true only once per nonce. Deleting before verifying the
// signature would let a failed attempt burn someone's nonce, so the
// caller consumes only after everything else has passed.
async function consumeNonce(nonce, wallet) {
  const db = getAdminDb();
  if (db) {
    const ref = db.collection("nonces").doc(nonce);
    const snap = await ref.get();
    if (!snap.exists) return false;
    const d = snap.data();
    await ref.delete();
    return d.wallet === wallet && d.expires > Date.now();
  }
  sweepMemory();
  const d = memNonces.get(nonce);
  if (!d) return false;
  memNonces.delete(nonce);
  return d.wallet === wallet && d.expires > Date.now();
}

// ---------- the signed message ----------
export function buildSignInMessage(wallet, nonce) {
  return [
    "Sign in to bannr",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    "",
    "This proves you own this wallet.",
    "It does not authorise any transaction and costs nothing.",
  ].join("\n");
}

// ---------- signature verification ----------
export function verifySignature(wallet, message, signatureB64) {
  try {
    const pubkey = new PublicKey(wallet).toBytes();
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pubkey);
  } catch {
    return false;
  }
}

// Full check: signature is valid AND the nonce was real, unused, in
// date, and issued to this same wallet.
export async function verifySignIn({ wallet, nonce, signature }) {
  if (!wallet || !nonce || !signature) return false;
  if (!verifySignature(wallet, buildSignInMessage(wallet, nonce), signature)) return false;
  return consumeNonce(nonce, wallet);
}

// ---------- session token ----------
// Compact JWT-shaped token, HMAC-SHA256. No library needed for
// something this small, and one less dependency to keep current.
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign(data) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — sessions cannot be issued.");
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSession(wallet) {
  const payload = b64url(
    JSON.stringify({ w: wallet, exp: Date.now() + SESSION_DAYS * 86_400_000 })
  );
  return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;

  // timingSafeEqual throws on length mismatch, so compare lengths
  // first — and never short-circuit on content.
  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  try {
    const { w, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!w || !exp || exp < Date.now()) return null;
    return { wallet: w };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

// The user-side mirror of requireAdmin. Returns { wallet } or null —
// every route that spends credits must call this and must not trust
// any wallet address sent in the request body.
export function requireUser(req) {
  const raw = req.cookies?.get?.(SESSION_COOKIE)?.value;
  return readSession(raw);
}
