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
// So the intent has to outlive the page. It lives in localStorage:
// what we were doing, the address the wallet named, the nonce the
// server issued, and whatever the page needed to remember.
//
// ══ localStorage, NOT sessionStorage ══
//
// This was sessionStorage first, reasoning that a half-finished link
// is worthless in another tab. That reasoning was right about intent
// and wrong about this protocol, because THE REDIRECT LANDS IN
// ANOTHER TAB. iOS does not return the browser to the tab that left;
// Safari opens the redirect fresh. sessionStorage is per-tab, so the
// resume read an empty box, found no pending flow, and did nothing —
// you came back from Phantom to a page that had never heard of you,
// still saying "None linked".
//
// localStorage is shared across tabs, which is the only lifetime
// that matches a flow the browser finishes somewhere else. The
// ten-minute expiry below is what stops it becoming litter.
//
// The wallet session lives in localStorage too — lib/deeplink.js's
// business, and worth keeping, because a connected wallet should
// still be connected tomorrow.
// ============================================================
"use client";

const KEY = "bl:flow";
// Bumped whenever a flow completes. Other tabs get a `storage` event
// for it and can re-read the account — which is how the tab you
// STARTED in stops sitting there mid-flow forever.
export const DONE_KEY = "bl:done";

// "link"   — add this wallet to the account already signed in
// "signin" — sign in as whoever owns this wallet, creating the
//            account on first sight
// "buy"    — pay for a pack; `payload` carries which one, because the
//            page that knew died two navigations ago
// `extra` carries a challenge that was fetched AHEAD of the tap, for
// a wallet already connected on a previous visit. Written here so the
// whole record lands in one synchronous call — the navigation that
// follows must happen inside the tap, and an await before it sends
// the browser to phantom.app instead of to Phantom.
export function beginFlow(intent, provider, payload = null, extra = null) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ intent, provider, payload, ...(extra || {}), at: Date.now() })
    );
  } catch {}
}

export function readFlow() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const f = JSON.parse(raw);
    // Ten minutes. The server's nonce dies at five, so anything older
    // than this is going to fail verification anyway and the honest
    // thing is to forget it rather than march the user through two
    // app-hops to be told no.
    //
    // It matters more here than it did in sessionStorage: this now
    // outlives the tab, so without an expiry a flow abandoned days
    // ago would try to resume the next time anyone came back.
    if (!f?.intent || Date.now() - (f.at || 0) > 600_000) { endFlow(); return null; }
    return f;
  } catch {
    return null;
  }
}

export function endFlow() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Tell the other tabs. The one that started this is still sitting
// there mid-flow, and a `storage` event is the only thing that can
// reach it — nothing else crosses tabs.
export function announceDone() {
  try { localStorage.setItem(DONE_KEY, String(Date.now())); } catch {}
}

function patchFlow(extra) {
  const f = readFlow();
  if (!f) return null;
  const next = { ...f, ...extra };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

// Step two, run when the wallet hands back an address: ask the server
// for a challenge and write it down.
//
// FETCHING AND NAVIGATING ARE SEPARATE ON PURPOSE. They used to be
// one function, which meant the hop to the wallet happened after an
// await — and iOS only gives a universal link to the app when the
// navigation is user-initiated, so the hop landed on phantom.app's
// download page instead. This half runs on page load, where there is
// no gesture to lose; the navigation waits for a tap.
//
// The message is COMPOSED BY THE SERVER and passed through untouched.
// If the client built its own, the two sides could drift by a space
// and every signature would fail verification with nothing anywhere
// saying why.
export async function fetchChallenge(address) {
  const challenge = await fetchChallengeFor(address);
  patchFlow({ address, nonce: challenge.nonce });
  return challenge;
}

// The same request, WITHOUT writing it down. Used to arm the button
// before anyone has tapped it: there is no flow to patch yet, and
// starting one on a page someone may never act on would leave a
// pending intent lying around for ten minutes.
//
// The caller keeps the result and writes it in at the moment of the
// tap — see startWalletDeeplink.
export async function fetchChallengeFor(address) {
  const res = await fetch("/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: address }),
  });
  const challenge = await res.json();
  if (!res.ok) throw new Error(challenge.error || "Could not start.");
  return challenge;
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
