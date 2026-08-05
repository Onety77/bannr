// ============================================================
// SIGNING IN, OR LINKING A WALLET, ACROSS APP HOPS.
//
// With an injected provider this is one async function: connect, ask
// the server for a nonce, sign it, post it. With deeplinks the same
// four steps span THREE PAGE LOADS, because the browser leaves for
// the wallet app twice and comes back a different page each time.
//
//   tap ──► Phantom ──► back here ──► Phantom ──► back here ──► done
//           connect      (nonce)      signMessage    (verify)
//
// So the intent has to outlive the page. It lives in sessionStorage:
// what we were doing, for which account, and the nonce the server
// issued — a nonce that is single-use and five minutes old, which is
// also why nothing here retries.
//
// WHY sessionStorage AND NOT localStorage: a half-finished link is
// worthless in another tab and actively confusing a day later. This
// dies with the tab, which is the same lifetime as the intent.
//
// The wallet session itself does live in localStorage — that is
// lib/deeplink.js's business, and it is worth keeping, because a
// connected wallet should still be connected tomorrow.
// ============================================================
"use client";

const KEY = "bl:flow";

// "link"   — add this wallet to the account already signed in
// "signin" — sign in as whoever owns this wallet, creating the
//            account on first sight
export function beginFlow(intent, provider) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ intent, provider, at: Date.now() }));
  } catch {}
}

export function readFlow() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const f = JSON.parse(raw);
    // Ten minutes. The server's nonce dies at five, so anything older
    // than this is going to fail verification anyway and the honest
    // thing is to forget it rather than march the user through two
    // app-hops to be told no.
    if (!f?.intent || Date.now() - (f.at || 0) > 600_000) { endFlow(); return null; }
    return f;
  } catch {
    return null;
  }
}

export function endFlow() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

function patchFlow(extra) {
  const f = readFlow();
  if (!f) return null;
  const next = { ...f, ...extra };
  try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

// Step two, run when the wallet hands back an address: ask the server
// for a challenge and hop straight back out to have it signed.
//
// The message is COMPOSED BY THE SERVER and passed through untouched.
// If the client built it instead, the two sides could drift by a
// space and every signature would fail verification with nothing
// anywhere saying why.
export async function requestSignature(DeepLink, provider, address) {
  const res = await fetch("/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: address }),
  });
  const challenge = await res.json();
  if (!res.ok) throw new Error(challenge.error || "Could not start.");

  patchFlow({ address, nonce: challenge.nonce });
  // Navigates away. Nothing after this line runs.
  DeepLink.signMessage(provider, challenge.message, "wallet");
}

// Step three, run when the signature comes back. Returns the server's
// response so the caller can update the UI; throws with a message
// worth showing if it did not take.
export async function submitSignature({ intent, address, nonce, signature }) {
  const url = intent === "signin" ? "/api/auth/verify" : "/api/auth/identities";
  const body = intent === "signin"
    ? { wallet: address, nonce, signature }
    : { type: "wallet", wallet: address, nonce, signature };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  if (!res.ok) {
    throw new Error(
      out.error || (intent === "signin" ? "Sign-in failed." : "Couldn't link that wallet.")
    );
  }
  return out;
}
