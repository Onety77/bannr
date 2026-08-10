// ============================================================
// PAYING BY TRANSFER REQUEST — a Solana Pay `solana:` URL.
//
// ══ WHY THIS REPLACED THE SIGNING HOP ══
//
// The deeplink path had us build the transaction and the wallet sign
// it. That means WE choose the blockhash, and a blockhash lives about
// sixty seconds — measured, not assumed: 400 slots old comes back
// "Blockhash not found" while a fresh one simulates cleanly.
//
// Everything had to fit inside that minute: the wait for the tap, the
// hop out, Phantom starting, a security warning to read, the approval,
// and Safari opening a NEW TAB and loading this whole app again from
// nothing before it could broadcast. It did not fit. Rebuilding the
// transaction every ten seconds bought a little and lost anyway,
// because the part after the tap is not ours to compress — it is
// however long a person takes to read a warning about their money.
//
// A transfer request hands the WALLET the intent — pay this address
// this much — and the wallet builds and signs and sends it itself,
// with a blockhash it fetches at the moment of approval. There is no
// deadline to miss. Take five minutes; it still works.
//
// ══ WHAT ELSE FALLS AWAY ══
//
// The connect hop. Paying no longer needs a session, an encryption
// keypair, a shared secret or a redirect, because nothing comes back
// through the URL — we find the payment on chain afterwards by its
// reference. So the "connect first, then approve" two-hop dance is
// gone from the money path, and with it the failed first connect.
//
// ══ AND WHAT IT COSTS ══
//
// No redirect back. The user approves in Phantom and stays there; they
// return to the browser themselves. The page is still open and still
// polling, so it picks up the moment they do — but the UI has to say
// so rather than pretend a redirect is coming.
//
// Sign-in still uses lib/deeplink.js. Proving you own a wallet needs a
// signature over a server nonce, which a transfer request cannot give.
// ============================================================
"use client";

// Base58 over 32 random bytes. A reference is only ever an ACCOUNT KEY
// — read-only, never a signer — so it needs no private key and no
// curve check; any 32 bytes is a valid address to attach and then
// search for. Generated here rather than with @solana/web3.js because
// that import is dynamic, and an await anywhere near the tap spends
// the gesture that opens the wallet app.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encode58(bytes) {
  const digits = [0];
  for (let i = 0; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (let i = 0; bytes[i] === 0 && i < bytes.length - 1; i += 1) out += "1";
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i]];
  return out;
}

/** A fresh reference to tag one payment attempt with and find later. */
export function newReference() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encode58(bytes);
}

/**
 * The URL that opens a wallet on a filled-in payment.
 *
 * SYNCHRONOUS, and it has to stay that way: this is called inside the
 * tap and the navigation follows immediately. Everything it needs —
 * treasury, amount, reference — is already known by then.
 */
export function transferUrl({ treasury, sol, reference, accountId, label = "bannr", message }) {
  if (!treasury) throw new Error("Treasury wallet not configured yet.");
  if (!(sol > 0)) throw new Error("Can't quote a price right now.");
  if (!reference) throw new Error("Missing payment reference.");

  const params = new URLSearchParams();
  // Trailing zeros trimmed: some wallets render the amount back to the
  // user exactly as written, and "0.07110000" reads like a glitch.
  params.set("amount", String(Number(sol)));
  params.set("reference", reference);
  params.set("label", label);
  if (message) params.set("message", message);
  // The account this pays for. /api/pay/claim matches this against the
  // signed-in account, which is what lets any wallet pay for any
  // account without being registered to it first.
  if (accountId) params.set("memo", String(accountId));

  return `solana:${treasury}?${params.toString()}`;
}

// ══ THE ATTEMPT HAS TO OUTLIVE THE PAGE BEING BACKGROUNDED ══
//
// Opening a `solana:` URL switches apps. iOS is free to discard the
// tab behind it, and on the way back the page may be a cold load that
// never saw the tap — the same problem the old flow had, minus the
// redirect. So the reference is written down before navigating, and
// the page picks the watch back up on load.
//
// localStorage, not sessionStorage: the tab that returns is not
// reliably the tab that left.
const KEY = "bannr:pay";

// Thirty minutes. Long enough that a slow approval, a phone call in
// the middle or a walk back to the browser still lands, short enough
// that an abandoned attempt is not still being polled for tomorrow.
const MAX_AGE = 30 * 60 * 1000;

export function savePending(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {}
}

export function readPending() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.reference || Date.now() - (p.at || 0) > MAX_AGE) { clearPending(); return null; }
    return p;
  } catch {
    return null;
  }
}

export function clearPending() {
  try { localStorage.removeItem(KEY); } catch {}
}
