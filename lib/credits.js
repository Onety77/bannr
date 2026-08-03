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

// Mirrors of the server's constants, for labels only. The server
// enforces its own values — if these ever drift, the server wins and
// the UI is merely wrong about a price, not wrong about a balance.
export const GENERATION_COST = 3;
export const EDIT_COST = 1;

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

export function deleteFromHistory(id) {
  const next = getHistory().filter((h) => h.id !== id);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function saveToHistory(entry, dataUrl) {
  const list = getHistory();
  // Saving now happens on DOWNLOAD, and people download the same
  // banner more than once — the PNG, then the X version, then again
  // tomorrow from the same open tab. The signature is derived from the
  // image bytes, so the same banner never becomes two history cards,
  // while a genuinely different banner (an edit of it, say) does.
  if (entry.sig && list.some((h) => h.sig === entry.sig)) return;
  // downscale the thumb so history never blows the 5MB quota
  const thumb = await shrink(dataUrl, 450, 150);
  list.unshift({ ...entry, thumb, ts: Date.now(), id: crypto.randomUUID() });
  while (list.length > 24) list.pop();
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // quota — drop oldest and retry once
    list.splice(8);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }
}

function shrink(dataUrl, w, h) {
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
