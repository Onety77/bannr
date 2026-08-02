// ============================================================
// ACCOUNTS — credits, preferences, daily allowances.
//
// The document id is an opaque ACCOUNT ID. It used to be the wallet
// address, which quietly fused three separate things: who you are,
// how you sign in, and how you pay. Changing wallet meant losing your
// credits, and buying credits meant connecting a wallet just to look
// at the site.
//
// How you prove you are this account now lives in lib/identities.js —
// Google, a wallet, whatever comes later. Nothing in this file knows
// or cares which one you used.
//
// `wallets: [address]` stays, but its meaning has narrowed: it is the
// set of addresses whose PAYMENTS belong here, used by the Helius
// webhook as a fallback when a transfer arrives with no claim
// attached. It is no longer how anyone signs in.
//
// LEGACY IDS: accounts created before this split still have a wallet
// address as their document id, and that is fine — an address is a
// perfectly good opaque string. Nothing was migrated, no balance was
// ever in flight, and old session cookies still open the right
// account.
//
// CREDITS ARE AUTHORITATIVE HERE. They used to live in localStorage,
// which meant the browser decided what it could afford — anyone could
// set their own balance from the console. Nothing outside this file
// may add or remove credits, and every mutation runs in a Firestore
// transaction so two parallel generations can't both spend the last
// credit.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { linkIdentity, resolveIdentity, newAccountId } from "@/lib/identities";

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

function blank() {
  return {
    wallets: [],           // addresses whose payments land here
    credits: SIGNUP_CREDITS,
    grantedSignup: true,
    editsDate: todayKey(),
    editsUsed: 0,
    createdAt: Date.now(),
  };
}

// ---------- creation ----------

// Find the account behind an identity, or make one and attach it.
//
// The free credits are granted with the ACCOUNT, not the identity, so
// linking a second wallet or a Google login to an existing account
// never grants them again. `grantedSignup` keeps that idempotent even
// if this is somehow called twice.
export async function getOrCreateByIdentity(type, id) {
  const existing = await resolveIdentity(type, id);
  if (existing) {
    const u = await getUser(existing);
    // An identity pointing at a deleted account would otherwise 500
    // every request for someone who cannot sign in any other way.
    if (u) return u;
  }

  // LEGACY ADOPTION — the safety net that makes the migration script
  // a tidy-up rather than a prerequisite.
  //
  // Before the split, the account document id WAS the wallet address.
  // If a document already exists under this address it is theirs, and
  // creating a fresh account instead would strand a real balance. So
  // adopt it and write the identity record on the spot. Without this,
  // anyone signing in between the deploy and the migration would
  // silently lose their credits — and no deploy ordering is worth
  // betting someone's balance on.
  if (type === "wallet") {
    const legacy = await getUser(id);
    if (legacy) {
      await linkIdentity(type, id, id);
      return legacy;
    }
  }

  const accountId = newAccountId();
  const doc = blank();
  // A wallet identity is also a paying address by definition.
  if (type === "wallet") doc.wallets = [id];

  const db = getAdminDb();
  if (!db) mem.set(accountId, doc);
  else await db.collection("users").doc(accountId).set(doc);

  const linked = await linkIdentity(type, id, accountId);
  if (!linked.ok) {
    // Lost a race: another request created the account first. Theirs
    // wins — ours is an empty document nobody can reach.
    const winner = await getUser(linked.accountId);
    if (winner) return winner;
  }
  return { id: accountId, ...doc };
}

export async function getUser(accountId) {
  const db = getAdminDb();
  if (!db) return mem.has(accountId) ? { id: accountId, ...mem.get(accountId) } : null;
  const snap = await db.collection("users").doc(accountId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// Stored purely so there is somewhere to send a receipt or a "your
// banner is ready". Never an identity — see /api/auth/google for why
// the Google uid is what actually opens the account.
export async function setEmail(accountId, email) {
  const clean = String(email || "").trim().slice(0, 254).toLowerCase();
  if (!clean) return;
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u) u.email = clean;
    return;
  }
  await db.collection("users").doc(accountId).set({ email: clean }, { merge: true });
}

// Register an address as one this account pays from. Idempotent, and
// the identity link is what actually makes the claim exclusive — this
// array is only the webhook's fallback lookup.
export async function addPayingWallet(accountId, address) {
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u && !u.wallets.includes(address)) u.wallets.push(address);
    return;
  }
  const ref = db.collection("users").doc(accountId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const list = snap.data().wallets || [];
    if (list.includes(address)) return;
    tx.update(ref, { wallets: [...list, address] });
  });
}

// ---------- credits ----------

// Atomically take `amount` credits. Returns the new balance, or null
// if they couldn't afford it — callers must treat null as a hard stop
// and must not fall back to "let them through anyway".
export async function spendCredits(accountId, amount) {
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId) || blank();
    if ((u.credits || 0) < amount) return null;
    u.credits -= amount;
    mem.set(accountId, u);
    return u.credits;
  }
  const ref = db.collection("users").doc(accountId);
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
export async function refundCredits(accountId, amount) {
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u) { u.credits += amount; mem.set(accountId, u); }
    return u?.credits ?? 0;
  }
  const ref = db.collection("users").doc(accountId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const next = (snap.data().credits || 0) + amount;
    tx.update(ref, { credits: next });
    return next;
  });
}

// Add purchased credits. Separate from refundCredits only so the
// intent is legible at the call site and in any future audit.
export async function grantCredits(accountId, amount) {
  return refundCredits(accountId, amount);
}

// Free daily edits, then credits. The day boundary is UTC and stored
// on the account, so it survives a cleared browser and can't be reset
// by changing the device clock — both of which the old localStorage
// version allowed.
export async function consumeEdit(accountId) {
  const db = getAdminDb();
  const today = todayKey();

  if (!db) {
    const u = mem.get(accountId) || blank();
    if (u.editsDate !== today) { u.editsDate = today; u.editsUsed = 0; }
    if (u.editsUsed < FREE_EDITS_PER_DAY) {
      u.editsUsed++; mem.set(accountId, u);
      return { ok: true, paidWith: "free", credits: u.credits, freeLeft: FREE_EDITS_PER_DAY - u.editsUsed };
    }
    if ((u.credits || 0) < EDIT_COST) return { ok: false };
    u.credits -= EDIT_COST; mem.set(accountId, u);
    return { ok: true, paidWith: "credits", credits: u.credits, freeLeft: 0 };
  }

  const ref = db.collection("users").doc(accountId);
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
// Lives on the account rather than the browser, so it follows you to
// a new device — the same reason credits moved server-side.
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

export async function getSettings(accountId) {
  const u = await getUser(accountId);
  return cleanSettings(u?.settings);
}

export async function saveSettings(accountId, raw) {
  const settings = cleanSettings(raw);
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u) { u.settings = settings; mem.set(accountId, u); }
    return settings;
  }
  await db.collection("users").doc(accountId).set({ settings }, { merge: true });
  return settings;
}

// What the client is allowed to know about itself.
export function publicUser(u, identities = []) {
  if (!u) return null;
  const today = todayKey();
  const used = u.editsDate === today ? u.editsUsed || 0 : 0;
  const google = identities.find((i) => i.type === "google");
  return {
    accountId: u.id,
    // Kept for the nav, which has always shown a truncated address.
    // Now simply the first paying wallet, and absent for a Google-only
    // account — the UI falls back to the email.
    wallet: (u.wallets || [])[0] || null,
    wallets: u.wallets || [],
    email: u.email || null,
    hasGoogle: !!google,
    credits: u.credits || 0,
    freeEditsLeft: Math.max(0, FREE_EDITS_PER_DAY - used),
    editCost: EDIT_COST,
    generationCost: GENERATION_COST,
  };
}
