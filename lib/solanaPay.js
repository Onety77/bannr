// Mobile checkout deliberately uses the smallest reliable Solana Pay
// surface: a destination and a server-reserved exact amount. Phantom does
// not consistently preserve Solana Pay references or memos, so neither is
// part of the mobile attribution contract. The server recognises the exact
// amount it reserved for the signed-in account before this URL is opened.
"use client";

// Kept as a compatibility helper for older callers. New checkout does not
// use references because Phantom may discard them before broadcasting.
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

export function newReference() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encode58(bytes);
}

/**
 * Build the wallet-native payment request. This must stay synchronous: on
 * iOS an awaited operation between the tap and navigation can turn the
 * universal link into an ordinary web page.
 */
export function transferUrl({ treasury, sol, label = "bannr", message, reference, accountId }) {
  if (!treasury) throw new Error("Payments aren't available yet.");
  if (!(Number(sol) > 0)) throw new Error("Can't quote a price right now.");
  if (reference === "") throw new Error("Missing payment reference.");

  const params = new URLSearchParams();
  params.set("amount", String(Number(sol)));
  // Compatibility only. New checkout intentionally passes neither field.
  if (reference) params.set("reference", reference);
  if (accountId) params.set("memo", String(accountId));
  params.set("label", label);
  if (message) params.set("message", message);
  return `solana:${treasury}?${params.toString()}`;
}

// This is only presentation state. The server is the source of truth and
// finds any outstanding reserved payment on every visit, even if a phone
// discarded the tab while the wallet was open.
const KEY = "bannr:pay";
const MAX_AGE = 30 * 60 * 1000;

export function savePending(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch {}
}

export function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!p?.packId || Date.now() - (p.at || 0) > MAX_AGE) { clearPending(); return null; }
    return p;
  } catch { return null; }
}

export function clearPending() {
  try { localStorage.removeItem(KEY); } catch {}
}
