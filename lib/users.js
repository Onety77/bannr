// ============================================================
// USERS — the account behind a wallet.
//
// Document id IS the wallet address. That keeps lookups free of an
// index, and `wallets: [address]` is written alongside it because
// the Helius webhook matches payments with
// `where("wallets", "array-contains", sender)`. That query has never
// matched anything, because nothing has ever written that field —
// this is what finally closes the payment loop.
//
// The array shape is kept even though multi-wallet is deliberately
// out of scope: it costs nothing now and means linking a second
// wallet later is a data change, not a migration.
//
// CREDITS ARE AUTHORITATIVE HERE. They used to live in localStorage,
// which meant the browser decided what it could afford — anyone
// could set their own balance from the console. Nothing outside this
// file may add or remove credits, and every mutation runs in a
// Firestore transaction so two parallel generations can't both spend
// the last credit.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const GENERATION_COST = 3;
export const EDIT_COST = 1;
export const SIGNUP_CREDITS = 12;
export const FREE_EDITS_PER_DAY = 3;

// Dev fallback so the app runs before Firebase is configured. NOT a
// real store: it dies with the process and is per-instance. Anything
// that must survive a restart needs Firestore.
const mem = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10); // UTC, so it can't be gamed by travel
}

function blank(wallet) {
  return {
    wallet,
    wallets: [wallet],
    credits: SIGNUP_CREDITS,
    grantedSignup: true,
    editsDate: todayKey(),
    editsUsed: 0,
    createdAt: Date.now(),
  };
}

// Creates the account on first sign-in and grants the free credits
// exactly once — `grantedSignup` makes that idempotent, so clearing
// a browser or signing in from a new device never re-grants.
export async function getOrCreateUser(wallet) {
  const db = getAdminDb();
  if (!db) {
    if (!mem.has(wallet)) mem.set(wallet, blank(wallet));
    return { ...mem.get(wallet) };
  }
  const ref = db.collection("users").doc(wallet);
  const snap = await ref.get();
  if (snap.exists) return { id: snap.id, ...snap.data() };
  const doc = blank(wallet);
  await ref.set(doc);
  return { id: wallet, ...doc };
}

export async function getUser(wallet) {
  const db = getAdminDb();
  if (!db) return mem.has(wallet) ? { ...mem.get(wallet) } : null;
  const snap = await db.collection("users").doc(wallet).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// Atomically take `amount` credits. Returns the new balance, or null
// if they couldn't afford it — callers must treat null as a hard stop
// and must not fall back to "let them through anyway".
export async function spendCredits(wallet, amount) {
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(wallet) || blank(wallet);
    if ((u.credits || 0) < amount) return null;
    u.credits -= amount;
    mem.set(wallet, u);
    return u.credits;
  }
  const ref = db.collection("users").doc(wallet);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const credits = snap.data().credits || 0;
    if (credits < amount) return null;
    tx.update(ref, { credits: credits - amount });
    return credits - amount;
  });
}

// Give credits back after a failed generation. Deliberately has no
// "max" check: refunding is always safe, and silently failing to
// refund would be a real loss to a paying user.
export async function refundCredits(wallet, amount) {
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(wallet);
    if (u) { u.credits += amount; mem.set(wallet, u); }
    return u?.credits ?? 0;
  }
  const ref = db.collection("users").doc(wallet);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const next = (snap.data().credits || 0) + amount;
    tx.update(ref, { credits: next });
    return next;
  });
}

// Free daily edits, then credits. The day boundary is UTC and stored
// on the account, so it survives a cleared browser and can't be reset
// by changing the device clock — both of which the old localStorage
// version allowed.
export async function consumeEdit(wallet) {
  const db = getAdminDb();
  const today = todayKey();

  if (!db) {
    const u = mem.get(wallet) || blank(wallet);
    if (u.editsDate !== today) { u.editsDate = today; u.editsUsed = 0; }
    if (u.editsUsed < FREE_EDITS_PER_DAY) {
      u.editsUsed++; mem.set(wallet, u);
      return { ok: true, paidWith: "free", credits: u.credits, freeLeft: FREE_EDITS_PER_DAY - u.editsUsed };
    }
    if ((u.credits || 0) < EDIT_COST) return { ok: false };
    u.credits -= EDIT_COST; mem.set(wallet, u);
    return { ok: true, paidWith: "credits", credits: u.credits, freeLeft: 0 };
  }

  const ref = db.collection("users").doc(wallet);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false };
    const d = snap.data();
    const used = d.editsDate === today ? d.editsUsed || 0 : 0;

    if (used < FREE_EDITS_PER_DAY) {
      tx.update(ref, { editsDate: today, editsUsed: used + 1 });
      return { ok: true, paidWith: "free", credits: d.credits || 0, freeLeft: FREE_EDITS_PER_DAY - used - 1 };
    }
    if ((d.credits || 0) < EDIT_COST) return { ok: false };
    tx.update(ref, { credits: d.credits - EDIT_COST, editsDate: today, editsUsed: used });
    return { ok: true, paidWith: "credits", credits: d.credits - EDIT_COST, freeLeft: 0 };
  });
}

// ---------- saved preferences ----------
// Lives on the account rather than the browser, so it follows the
// wallet to a new device — the same reason credits moved server-side.
//
// Deliberately capped and sanitised on write: this is user-supplied
// JSON going into a document, and a Firestore doc has a 1 MiB ceiling.
// Nothing here is trusted about shape or size.
export const EMPTY_SETTINGS = {
  defaults: {},        // { [styleId]: { advanced control values } }
  avoid: "",           // one rule appended to EVERY style
  styles: [],          // pre-selected styles on /create
  variants: 3,
};

const str = (v, n) => String(v ?? "").slice(0, n);

function cleanSettings(raw = {}) {
  const out = { ...EMPTY_SETTINGS, defaults: {} };

  if (raw.defaults && typeof raw.defaults === "object") {
    // At most 12 styles, 20 keys each — a bound, not a schema. The
    // control definitions live in lib/advanced.js and validating
    // against them here would couple the two files together.
    for (const [styleId, vals] of Object.entries(raw.defaults).slice(0, 12)) {
      if (!vals || typeof vals !== "object") continue;
      const kept = {};
      for (const [k, v] of Object.entries(vals).slice(0, 20)) {
        if (typeof v === "string") kept[k] = v.slice(0, 300);
        else if (typeof v === "number" && Number.isFinite(v)) kept[k] = v;
      }
      out.defaults[str(styleId, 40)] = kept;
    }
  }

  out.avoid = str(raw.avoid, 300);
  out.styles = Array.isArray(raw.styles) ? raw.styles.slice(0, 8).map((s) => str(s, 40)) : [];
  out.variants = Math.min(Math.max(parseInt(raw.variants, 10) || 3, 2), 4);
  // NOTE: a saved default brief used to live here. Removed — most
  // people make banners for many projects, not one, so a prefilled
  // name was wrong more often than right. Any `brief` left on an
  // existing document is simply dropped on the next save.
  return out;
}

export async function getSettings(wallet) {
  const u = await getUser(wallet);
  return cleanSettings(u?.settings);
}

export async function saveSettings(wallet, raw) {
  const settings = cleanSettings(raw);
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(wallet);
    if (u) { u.settings = settings; mem.set(wallet, u); }
    return settings;
  }
  await db.collection("users").doc(wallet).set({ settings }, { merge: true });
  return settings;
}

// What the client is allowed to know about itself.
export function publicUser(u) {
  if (!u) return null;
  const today = todayKey();
  const used = u.editsDate === today ? u.editsUsed || 0 : 0;
  return {
    wallet: u.wallet,
    credits: u.credits || 0,
    freeEditsLeft: Math.max(0, FREE_EDITS_PER_DAY - used),
    editCost: EDIT_COST,
    generationCost: GENERATION_COST,
  };
}
