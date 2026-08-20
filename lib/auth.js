// ============================================================
// SESSIONS — proving which ACCOUNT a request belongs to.
//
// A session names an account id, never a wallet and never an email.
// Which identity opened it (Google, a wallet, whatever comes later)
// is resolved once at sign-in by lib/identities.js and then forgotten
// — everything downstream only needs to know whose credits these are.
//
// This file still owns the wallet-signature half, because that is
// genuinely cryptographic work: nonce, Ed25519, replay protection.
// Google sign-in verifies its token through the Firebase Admin SDK
// instead (see /api/auth/google) and lands in the same place.
//
// Wallet flow:
//   1. client asks for a nonce           POST /api/auth/nonce
//   2. wallet signs a human-readable message containing it
//   3. server verifies the Ed25519 signature and burns the nonce
//   4. server resolves the address to an account and sets the cookie
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
    // What it is FOR, and nothing else. This used to add "it does not
    // authorise any transaction and costs nothing" — true, and a
    // mistake, because Phantom's own sheet already says signing
    // proves ownership, and volunteering that nothing is spent is
    // what makes someone stop and wonder whether it might be. The
    // line answering a question nobody asked is the line that
    // teaches them to ask it.
    "This proves you own this wallet.",
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

export function createSession(accountId) {
  const payload = b64url(
    JSON.stringify({ a: accountId, exp: Date.now() + SESSION_DAYS * 86_400_000 })
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
    const { a, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!a || !exp || exp < Date.now()) return null;
    return { accountId: a };
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

// The user-side mirror of requireAdmin. Returns { accountId } or null
// — every route that spends credits must call this, and must never
// trust an account id, wallet or email sent in the request body.
export function requireUser(req) {
  const raw = req.cookies?.get?.(SESSION_COOKIE)?.value;
  return readSession(raw);
}

// ---------- run token ----------
//
// ══ PROOF THAT A GENERATION HAPPENED, WITHOUT STORING ONE ══
//
// Posting a banner to the feed pays a credit back, once per run and
// three times a day. That needs an answer to "did this person really
// make this run", and a run id invented by the browser is not an
// answer — it is a credit printer.
//
// So /api/generate issues one of these and the browser sends it back
// when it posts. It carries the account it was issued to and the day
// it was issued on, HMAC'd with the same secret as a session, so it
// cannot be minted, edited or replayed on another account.
//
// NOTHING IS WRITTEN TO ISSUE ONE. The only thing that has to be
// remembered is which tokens were already PAID, and that is three ids
// on the account document, reset daily — see lib/feed.js. A run
// collection would have been one write per generation forever, to
// answer a question a signature answers for free.
//
// Same day only. A run made yesterday cannot be posted for credit
// today, which is what lets the paid list reset with the daily count
// instead of growing without bound. The edge is real — generate at
// 23:59, post at 00:01, no credit — and the alternative is keeping
// every id ever issued to defend one minute a day.
export function issueRunToken(accountId) {
  const nonce = crypto.randomBytes(9).toString("base64url");
  const day = new Date().toISOString().slice(0, 10);
  return `${nonce}.${day}.${sign(`run.${accountId}.${nonce}.${day}`)}`;
}

/** The run's id if this token is genuinely this account's, from today. */
export function readRunToken(accountId, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [nonce, day, mac] = parts;
  if (day !== new Date().toISOString().slice(0, 10)) return null;

  let expected;
  try {
    expected = sign(`run.${accountId}.${nonce}.${day}`);
  } catch {
    // No AUTH_SECRET. Refusing is right: the alternative is paying out
    // on a token nobody signed.
    return null;
  }
  // Constant time, because this compares a secret-derived value
  // against something a caller controls.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return nonce;
}
