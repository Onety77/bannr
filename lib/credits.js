// ============================================================
// CREDITS (client) — a VIEW of the server's numbers, never a source
// of truth.
//
// This file used to hold the balance in localStorage, which meant
// the browser decided what it could afford; setting your own credits
// from the console was a one-liner. Every number here now comes from
// /api/auth/me or from the response of the run that just happened,
// and every spend is performed server-side inside a Firestore
// transaction (lib/users.js). Nothing in this file can grant credit.
//
// History stays local on purpose. It holds full-resolution data URLs
// that would be expensive to store and serve, and losing it costs a
// convenience rather than something paid for. Moving it to the
// account is a later job (see NEXT-ACTIONS.md).
// ============================================================
"use client";

const HISTORY_KEY = "bannr.history";
const RECENT_CA_KEY = "bannr.recent-cas";

// ---- recent contract addresses ----
// Browser autofill covers this on desktop but is unreliable for a
// bare input on phones, so the create page draws its own suggestions.
// Capped at 3: the point is "the token I was just working on", not an
// archive — history already exists for that.
export function getRecentCAs() {
  try {
    const raw = window.localStorage.getItem(RECENT_CA_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, 3) : [];
  } catch {
    return [];
  }
}

// Saved only after a lookup SUCCEEDS — a typo or a dead address is
// not something worth offering back tomorrow.
export function saveRecentCA(address, label) {
  try {
    const list = getRecentCAs().filter((r) => r.address !== address);
    list.unshift({ address, label: String(label || "").slice(0, 24), ts: Date.now() });
    window.localStorage.setItem(RECENT_CA_KEY, JSON.stringify(list.slice(0, 3)));
  } catch {}
}

// Mirrors of the server's constants, for labels only. The server
// enforces its own values — if these ever drift, the server wins and
// the UI is merely wrong about a price, not wrong about a balance.
export const GENERATION_COST = 3;
export const EDIT_COST = 1;
// Mirrors REROLL_COST in lib/users.js, which is the authority. This
// copy exists only so the button can price itself; the server charges.
export const REROLL_COST = 1;

// ---- session-scoped cache of the last known account state ----
// Populated by fetchMe() and by any route that returns a fresh
// `user`, so the nav updates the moment a run completes.
let cached = null;

export function getCachedUser() {
  return cached;
}

export function setUser(user) {
  cached = user || null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("bannr:credits"));
  }
  return cached;
}

export async function fetchMe() {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const d = await res.json();
    return setUser(d.user);
  } catch {
    return setUser(null);
  }
}

export function isSignedIn() {
  return Boolean(cached);
}

export function getCredits() {
  return cached?.credits ?? 0;
}

export function getFreeEditsLeft() {
  return cached?.freeEditsLeft ?? 0;
}

export function canAffordGeneration() {
  return (cached?.credits ?? 0) >= GENERATION_COST;
}

export function canEdit() {
  if (!cached) return false;
  return cached.freeEditsLeft > 0 || cached.credits >= EDIT_COST;
}

export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  return setUser(null);
}

// ---- history (settings + small thumbnail, localStorage-safe) ----
export function getHistory() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export async function deleteFromHistory(id) {
  // Both stores, since an item can live in either during the
  // transition; deleting a local-only id from the API is a no-op.
  try { await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }); } catch {}
  const next = getHistory().filter((h) => h.id !== id);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

// Banners follow the ACCOUNT now. localStorage made history
// per-device, which read as "saving doesn't work" the first time
// anyone downloaded on the phone and looked on the laptop. The API is
// the store; localStorage survives only as the fallback when the
// network or the session lets us down, so a download is never lost.
export async function saveToHistory(entry, dataUrl) {
  const thumb = await shrink(dataUrl, 450, 150);
  if (!thumb) return;

  try {
    const res = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, thumb }),
    });
    if (res.ok) return;
  } catch {}

  // Offline, expired session, server trouble: keep it locally so the
  // download still leaves a trace. loadHistory() pushes these up on
  // the next visit.
  const list = getHistory();
  if (entry.sig && list.some((h) => h.sig === entry.sig)) return;
  list.unshift({ ...entry, thumb, ts: Date.now(), id: crypto.randomUUID(), local: true });
  while (list.length > 24) list.pop();
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    list.splice(8);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }
}

// The account's history, with a one-time sweep of anything stranded in
// this browser from the localStorage era (or from an offline save).
// Stranded items are pushed up — the server dedupes by signature — and
// cleared locally only after the push succeeded.
export async function loadHistory() {
  let remote = null;
  try {
    const res = await fetch("/api/history");
    if (res.ok) remote = (await res.json()).items || [];
  } catch {}

  const local = getHistory();
  if (remote === null) return local; // signed out or offline: show what we have

  if (local.length) {
    let pushed = 0;
    for (const h of local) {
      try {
        const r = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: h.brief, templateId: h.templateId,
            templateName: h.templateName, sig: h.sig || "", thumb: h.thumb,
          }),
        });
        if (r.ok) pushed++;
      } catch {}
    }
    if (pushed === local.length) {
      try { window.localStorage.removeItem(HISTORY_KEY); } catch {}
      try {
        const res = await fetch("/api/history");
        if (res.ok) return (await res.json()).items || [];
      } catch {}
    }
  }
  return remote;
}

export function shrink(dataUrl, w, h) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
