// ============================================================
// WALLET DEEPLINKS — Phantom and Solflare from a NORMAL mobile
// browser. No in-app browser, no extension, no handoff token.
//
// Safari and Chrome on a phone have no injected provider, so for
// months the only mobile path was: bounce the user into Phantom's own
// browser, where a provider does exist, and carry the session across
// by hand. That worked and it was miserable — a second browser with
// its own cookie jar, a single-use token to reunite the two, and a
// whole class of "I linked it and got a second account" bugs.
//
// This replaces all of it. The protocol is an app-hop:
//
//   1. Generate an x25519 keypair, open
//      https://phantom.app/ul/v1/connect?…&redirect_link=<here>
//   2. The wallet app opens, the user approves, and it redirects the
//      browser back with an encrypted payload: wallet public key and
//      a session token.
//   3. Every later request — signMessage, signTransaction — is
//      another hop: encrypt, deeplink out, approve, redirect back.
//
// EVERY STEP IS A FULL PAGE NAVIGATION, so this is resume-based, not
// promise-based. Keypair, shared secret, session and the pending
// action live in localStorage, and handleRedirect() picks the flow
// back up on load. Results arrive as a `walletdeeplink` event:
//   { type: 'connect',   provider, publicKey }
//   { type: 'message',   provider, signature, label }   ← base64, 64 bytes
//   { type: 'signed',    provider, transaction, label } ← base58, UNSENT
//   { type: 'error',     provider, message, label? }
//
// TWO CHANGES FROM THE ORIGINAL, both deliberate:
//
//   tweetnacl is imported from our own dependency instead of fetched
//   from esm.sh. It is already installed — lib/auth.js verifies every
//   signature with it — so the CDN was a network request, a
//   third-party host on the critical path of signing in, and a
//   webpack URL-import that would need a magic comment to survive the
//   build. A local import is smaller, offline-proof and faster.
//
//   signMessage was added, because it is the one our server actually
//   needs. Connect alone proves nothing to a backend: the browser is
//   the thing telling us the address, and it could name any address
//   it likes. Ownership is only proven by an Ed25519 signature over a
//   server-issued nonce, which is the whole sybil defence behind the
//   token gate. Both wallets implement it in this same shape.
// ============================================================
"use client";
import nacl from "tweetnacl";

const PROVIDERS = {
  phantom: {
    name: "Phantom",
    base: "https://phantom.app/ul/v1",
    responseKey: "phantom_encryption_public_key",
  },
  solflare: {
    name: "Solflare",
    base: "https://solflare.com/ul/v1",
    responseKey: "solflare_encryption_public_key",
  },
};

// The query param that marks a redirect back to us. Anything that
// strips the query string on load before handleRedirect() runs will
// silently break every flow in this file.
const MARKER = "dlwallet";

let cluster = "mainnet-beta";
let appUrl = typeof window !== "undefined" ? window.location.origin : "";

export function init(opts = {}) {
  if (opts.cluster) cluster = opts.cluster;
  if (opts.appUrl) appUrl = opts.appUrl;
}

/* ------------------------------------------------------------------ *
 * base58
 * ------------------------------------------------------------------ */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = Object.fromEntries([...B58].map((c, i) => [c, i]));

export function bs58encode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Empty in, empty out. Without this the digit loop below emits "1",
  // i.e. a zero byte that was never there. Unreachable with real
  // input — every buffer here is a 32-byte key, a 24-byte nonce, a
  // 64-byte signature or a non-empty message — but it is the one case
  // where this disagrees with the reference implementation, and a
  // base58 that is subtly wrong fails signatures with no visible
  // cause.
  if (arr.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < arr.length; i += 1) {
    let carry = arr[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (let i = 0; arr[i] === 0 && i < arr.length - 1; i += 1) out += "1";
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i]];
  return out;
}

export function bs58decode(str) {
  if (!str) return new Uint8Array(0); // see bs58encode
  const bytes = [0];
  for (const ch of str) {
    const val = B58_MAP[ch];
    if (val === undefined) throw new Error(`Invalid base58 character "${ch}"`);
    let carry = val;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let i = 0; str[i] === "1" && i < str.length - 1; i += 1) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

/* ------------------------------------------------------------------ *
 * persisted state, per provider
 * ------------------------------------------------------------------ */
const key = (provider, field) => `dl:${provider}:${field}`;

function saveState(provider, state) {
  for (const [f, v] of Object.entries(state)) {
    if (v === null || v === undefined) localStorage.removeItem(key(provider, f));
    else localStorage.setItem(key(provider, f), v);
  }
}
function getState(provider, field) {
  return localStorage.getItem(key(provider, field));
}
function clearState(provider) {
  saveState(provider, {
    secretKey: null, sharedSecret: null, session: null,
    publicKey: null, pending: null, connectedAt: null,
  });
}

/** Restore a previously connected deeplink session, if any. */
export function restoreSession(provider) {
  const publicKey = getState(provider, "publicKey");
  const session = getState(provider, "session");
  const sharedSecret = getState(provider, "sharedSecret");
  if (publicKey && session && sharedSecret) {
    // A session saved before this field existed reads as 0, i.e.
    // ancient, so anyone carrying one reconnects once and is then on
    // the fast path like everybody else.
    return { publicKey, session, connectedAt: Number(getState(provider, "connectedAt")) || 0 };
  }
  return null;
}

/** Any provider with a live session, so callers need not guess which. */
export function anySession() {
  for (const p of Object.keys(PROVIDERS)) {
    const s = restoreSession(p);
    if (s) return { provider: p, ...s };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * crypto
 * ------------------------------------------------------------------ */
function encryptPayload(provider, payloadObj) {
  const shared = bs58decode(getState(provider, "sharedSecret"));
  const nonce = nacl.randomBytes(24);
  const message = new TextEncoder().encode(JSON.stringify(payloadObj));
  const box = nacl.box.after(message, nonce, shared);
  return { nonce: bs58encode(nonce), payload: bs58encode(box) };
}

function decryptPayload(provider, dataB58, nonceB58, sharedSecretBytes) {
  const shared = sharedSecretBytes || bs58decode(getState(provider, "sharedSecret"));
  const opened = nacl.box.open.after(bs58decode(dataB58), bs58decode(nonceB58), shared);
  if (!opened) throw new Error("Could not decrypt the wallet response.");
  return JSON.parse(new TextDecoder().decode(opened));
}

function dappPublicKey(provider) {
  const secret = getState(provider, "secretKey");
  if (!secret) throw new Error("Wallet session expired. Connect again.");
  return bs58encode(nacl.box.keyPair.fromSecretKey(bs58decode(secret)).publicKey);
}

/* ------------------------------------------------------------------ *
 * navigation
 * ------------------------------------------------------------------ */
function redirectLink(provider, action) {
  const url = new URL(window.location.href);
  url.searchParams.set(MARKER, `${provider}:${action}`);
  return url.toString();
}

function navigate(url) {
  window.location.href = url;
}

export function isProvider(p) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, p);
}

export function providerName(p) {
  return PROVIDERS[p]?.name || "your wallet";
}

/**
 * Start the connect flow. Navigates away; the page reloads on return
 * and handleRedirect() finishes the job.
 */
export function connect(provider) {
  const def = PROVIDERS[provider];
  if (!def) throw new Error(`Unknown deeplink provider "${provider}"`);
  const kp = nacl.box.keyPair();
  saveState(provider, {
    secretKey: bs58encode(kp.secretKey),
    sharedSecret: null,
    session: null,
    publicKey: null,
  });
  const params = new URLSearchParams({
    app_url: appUrl,
    dapp_encryption_public_key: bs58encode(kp.publicKey),
    redirect_link: redirectLink(provider, "connect"),
    cluster,
  });
  navigate(`${def.base}/connect?${params}`);
}

/**
 * Sign a plain-text message — proof of ownership, nothing on-chain,
 * nothing spent. This is what the server verifies against a nonce it
 * issued; see lib/auth.js.
 *
 * `label` is echoed back on the redirect so the UI can say what
 * completed without having to remember across a page load.
 */
export function signMessage(provider, message, label = "") {
  const def = PROVIDERS[provider];
  if (!def) throw new Error(`Unknown deeplink provider "${provider}"`);
  const session = getState(provider, "session");
  if (!session) throw new Error("Wallet session expired. Connect again.");
  const { nonce, payload } = encryptPayload(provider, {
    // Base58, per the protocol — NOT the raw string. The wallet shows
    // the decoded text, which is why lib/auth.js writes a message
    // meant to be read and states that it authorises nothing.
    message: bs58encode(new TextEncoder().encode(message)),
    session,
    display: "utf8",
  });
  saveState(provider, { pending: label || "Signature" });
  const params = new URLSearchParams({
    dapp_encryption_public_key: dappPublicKey(provider),
    nonce,
    redirect_link: redirectLink(provider, "message"),
    payload,
  });
  navigate(`${def.base}/signMessage?${params}`);
}

/**
 * Sign a web3.js Transaction via app-hop. The wallet signs and hands
 * the signed transaction BACK; broadcasting is ours.
 *
 * ══ THIS USED TO BE signAndSendTransaction ══
 *
 * That method did both halves, and the wallet broadcast through its own
 * node so we never needed one. Phantom deprecated it in July 2025 and
 * has since switched it off: the app-hop came back with the wallet's
 * own "method not supported", AFTER the user had approved, which is the
 * worst place in the flow to fail — it reads as though the payment went
 * wrong rather than as though we asked for the wrong thing.
 *
 * signTransaction is the documented replacement and takes an identical
 * payload. The difference is entirely on the way back: the response
 * carries a base58 SIGNED TRANSACTION, not a signature, and nothing has
 * touched the chain until we submit it via /api/solana/send.
 */
export function signTransaction(provider, transaction, label = "") {
  const def = PROVIDERS[provider];
  if (!def) throw new Error(`Unknown deeplink provider "${provider}"`);
  const session = getState(provider, "session");
  if (!session) throw new Error("Wallet session expired. Connect again.");
  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const { nonce, payload } = encryptPayload(provider, {
    transaction: bs58encode(serialized),
    session,
  });
  saveState(provider, { pending: label || "Transaction" });
  const params = new URLSearchParams({
    dapp_encryption_public_key: dappPublicKey(provider),
    nonce,
    redirect_link: redirectLink(provider, "sign"),
    payload,
  });
  navigate(`${def.base}/signTransaction?${params}`);
}

export function disconnect(provider) {
  clearState(provider);
}

export function disconnectAll() {
  for (const p of Object.keys(PROVIDERS)) clearState(p);
}

/* ------------------------------------------------------------------ *
 * redirect handling — call once on every page load
 * ------------------------------------------------------------------ */
function emit(detail) {
  window.dispatchEvent(new CustomEvent("walletdeeplink", { detail }));
}

function cleanUrl() {
  const url = new URL(window.location.href);
  const drop = [MARKER, "nonce", "data", "errorCode", "errorMessage"];
  for (const p of Object.values(PROVIDERS)) drop.push(p.responseKey);
  for (const d of drop) url.searchParams.delete(d);
  window.history.replaceState({}, "", url.toString());
}

/** True when this page load is a wallet redirect. Cheap: no crypto,
 *  no imports, safe to call on every route. */
export function isRedirect() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(MARKER);
}

// Base64 of the raw 64 signature bytes, which is what our server
// takes. The wallet hands back base58; sending that through unchanged
// is exactly the class of bug that made the old in-app path fail
// silently, so the conversion lives here rather than at each caller.
function sigToBase64(b58) {
  const bytes = bs58decode(b58);
  if (bytes.length !== 64) throw new Error("That signature was the wrong length.");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function handleRedirect() {
  const qs = new URLSearchParams(window.location.search);
  const marker = qs.get(MARKER);
  if (!marker) return null;
  const [provider, action] = marker.split(":");
  const def = PROVIDERS[provider];
  cleanUrl();
  if (!def) return null;

  if (qs.get("errorCode")) {
    const message = qs.get("errorMessage") || `Request rejected (${qs.get("errorCode")}).`;
    const label = getState(provider, "pending");
    saveState(provider, { pending: null });
    const detail = { type: "error", provider, message, label };
    emit(detail);
    return detail;
  }

  try {
    if (action === "connect") {
      const walletPub = qs.get(def.responseKey);
      const shared = nacl.box.before(bs58decode(walletPub), bs58decode(getState(provider, "secretKey")));
      const data = decryptPayload(provider, qs.get("data"), qs.get("nonce"), shared);
      saveState(provider, {
        sharedSecret: bs58encode(shared),
        session: data.session,
        publicKey: data.public_key,
        // When, so callers can decide whether it is still worth
        // trusting. A session token survives in localStorage long
        // after the wallet has stopped honouring it, and the only way
        // to discover that is to spend an app-hop being refused.
        connectedAt: String(Date.now()),
      });
      const detail = { type: "connect", provider, publicKey: data.public_key };
      emit(detail);
      return detail;
    }

    if (action === "message") {
      const data = decryptPayload(provider, qs.get("data"), qs.get("nonce"));
      const label = getState(provider, "pending");
      saveState(provider, { pending: null });
      const detail = {
        type: "message",
        provider,
        signature: sigToBase64(data.signature),
        publicKey: getState(provider, "publicKey"),
        label,
      };
      emit(detail);
      return detail;
    }

    if (action === "sign") {
      const data = decryptPayload(provider, qs.get("data"), qs.get("nonce"));
      const label = getState(provider, "pending");
      saveState(provider, { pending: null });
      // A SIGNED TRANSACTION, base58, not a signature — see
      // signTransaction above. Nothing is on chain yet. Whoever
      // receives this has to broadcast it before it means anything,
      // which is why the type changed with the method rather than
      // keeping a familiar name over different bytes.
      const detail = { type: "signed", provider, transaction: data.transaction, label };
      emit(detail);
      return detail;
    }
  } catch (err) {
    const detail = { type: "error", provider, message: err.message || String(err) };
    emit(detail);
    return detail;
  }
  return null;
}

export const DeepLink = {
  PROVIDERS,
  init,
  connect,
  disconnect,
  disconnectAll,
  signMessage,
  signTransaction,
  restoreSession,
  anySession,
  handleRedirect,
  isRedirect,
  isProvider,
  providerName,
  bs58encode,
  bs58decode,
};

export default DeepLink;
