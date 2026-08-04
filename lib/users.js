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
// One more option in the same direction, priced like an edit
// because that is what it is: a refinement of work already paid
// for, not a new run. Deliberately NOT payable from the free
// holder bucket — that bucket counts RUNS, and a reroll is not a
// run. Spending a whole free run on one image would be a worse
// deal than the credit, which is a strange thing to force on the
// people being rewarded.
export const REROLL_COST = 1;
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
    // Token-gate state. All absent until the gate is switched on, and
    // all scoped to gateDate so a stale grant can never be spent on a
    // later day. See lib/tokenGate.js for what decides gateAllowance.
    gateDate: "",
    gateAllowance: 0,      // free runs granted for gateDate
    gateUsed: 0,           // of those, how many are spent
    gateCheckedAt: 0,      // last balance read, ms
  };
}

// How much of a run to give back when some options never arrived.
//
// The old rule was that a partial run cost full price, justified by
// "every variant that ran cost real money whether it came back or
// not". That is not true of the most common failure: a rate-limited
// request never generates an image and is never billed. So the user
// was paying for options that cost us nothing.
//
// Proportional, rounded in the user's favour, and capped so a run
// that delivered something always costs at least one credit — the
// alternative is a free run for anyone who gets one option back,
// which turns a failure into an incentive.
export function partialRefundCredits(missing, attempted) {
  if (missing <= 0 || attempted <= 0) return 0;
  if (missing >= attempted) return GENERATION_COST;
  const share = Math.round((GENERATION_COST * missing) / attempted);
  return Math.max(0, Math.min(share, GENERATION_COST - 1));
}

// ---------- token gate ----------

// Does this account need its balance re-read, and what is it holding
// in the meantime? Pure, so the decision is testable without a wallet,
// an RPC or a clock.
//
// The asymmetry is deliberate. A QUALIFYING account is not re-read for
// the rest of the day: it already earned the grant, and re-reading
// would spend an RPC call per generation to discover the same thing.
// A NON-qualifying one is re-read every recheckMinutes, because the
// person who buys the token at noon has to be able to use it at noon,
// not tomorrow.
export function gateStateOf(user, gate) {
  const today = todayKey();
  if (!user || user.gateDate !== today) return { needsCheck: true, allowance: 0, used: 0 };
  const allowance = user.gateAllowance || 0;
  const used = user.gateUsed || 0;
  if (allowance > 0) return { needsCheck: false, allowance, used };
  const age = Date.now() - (user.gateCheckedAt || 0);
  return { needsCheck: age > (gate?.recheckMinutes || 10) * 60_000, allowance: 0, used };
}

// Record what a balance read concluded. Stored on the account rather
// than recomputed so the create page can explain someone's standing
// without triggering an RPC call on every page load.
export async function setGateVerdict(accountId, allowance, verdict = {}) {
  const today = todayKey();
  const patch = {
    gateDate: today,
    gateAllowance: allowance,
    gateCheckedAt: Date.now(),
    gateReason: String(verdict.reason || ""),
    gateBalance: Number.isFinite(verdict.balance) ? verdict.balance : 0,
    gateWallet: verdict.wallet || "",
    gateMaturesAt: verdict.maturesAt || 0,
  };
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u) {
      // A new day resets what has been spent; the same day must not,
      // or a re-check would hand back runs already taken.
      if (u.gateDate !== today) u.gateUsed = 0;
      Object.assign(u, patch);
      mem.set(accountId, u);
    }
    return;
  }
  const ref = db.collection("users").doc(accountId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const rollover = snap.data().gateDate !== today ? { gateUsed: 0 } : {};
    tx.update(ref, { ...patch, ...rollover });
  });
}

// Take one generation: the free holder bucket first, then credits.
//
// One transaction covers the account AND the global daily counter,
// because a ceiling checked outside the transaction is a ceiling that
// leaks under concurrency — which on this feature means real money.
//
// `capped` says the free run was refused by the GLOBAL ceiling rather
// than by anything about this person. It still charges credits if they
// have them, so hitting the ceiling degrades to normal service instead
// of an outage, and the flag is what lets the UI say so honestly.
export async function consumeGeneration(accountId, { allowance = 0, globalCap = 0 } = {}) {
  const today = todayKey();
  const db = getAdminDb();

  if (!db) {
    const u = mem.get(accountId) || blank();
    if (u.gateDate !== today) { u.gateDate = today; u.gateUsed = 0; u.gateAllowance = allowance; }
    const used = u.gateUsed || 0;
    if (used < allowance) {
      u.gateUsed = used + 1; u.gateAllowance = allowance; mem.set(accountId, u);
      return { ok: true, paidWith: "holder", credits: u.credits || 0, holderLeft: allowance - used - 1 };
    }
    if ((u.credits || 0) < GENERATION_COST) return { ok: false };
    u.credits -= GENERATION_COST; mem.set(accountId, u);
    return { ok: true, paidWith: "credits", credits: u.credits, holderLeft: 0 };
  }

  const uref = db.collection("users").doc(accountId);
  const cref = db.collection("counters").doc(`gate-${today}`);

  return db.runTransaction(async (tx) => {
    // Every read before every write — a Firestore transaction rule,
    // and the counter read has to happen even when it will not be
    // written, because the ceiling decides which branch runs.
    const usnap = await tx.get(uref);
    const csnap = await tx.get(cref);
    if (!usnap.exists) return { ok: false };
    const d = usnap.data();
    const sameDay = d.gateDate === today;
    const used = sameDay ? d.gateUsed || 0 : 0;
    const globalUsed = csnap.exists ? csnap.data().runs || 0 : 0;
    const credits = d.credits || 0;
    const base = { gateDate: today, gateAllowance: allowance };

    if (used < allowance) {
      if (!(globalCap > 0 && globalUsed >= globalCap)) {
        tx.update(uref, { ...base, gateUsed: used + 1 });
        tx.set(cref, { day: today, runs: globalUsed + 1 }, { merge: true });
        return { ok: true, paidWith: "holder", credits, holderLeft: allowance - used - 1 };
      }
      // Ceiling reached. Fall through to credits rather than refusing:
      // someone who can pay should not be blocked by a promotion.
      if (credits < GENERATION_COST) return { ok: false, capped: true };
      tx.update(uref, { ...base, gateUsed: used, credits: credits - GENERATION_COST });
      return { ok: true, paidWith: "credits", credits: credits - GENERATION_COST, holderLeft: allowance - used, capped: true };
    }

    if (credits < GENERATION_COST) return { ok: false, holderLeft: 0 };
    tx.update(uref, { ...base, gateUsed: used, credits: credits - GENERATION_COST });
    return { ok: true, paidWith: "credits", credits: credits - GENERATION_COST, holderLeft: Math.max(0, allowance - used) };
  });
}

// Undo one generation charge after a failure. Which side it came from
// matters: refunding credits for a run that was free would mint them
// out of nothing, which is exactly the bug that let 1,404 credits
// appear against 0 payments.
// `amount` matters from the moment anything costs something other
// than a full run. A reroll charges 1 credit; refunding the run
// price would hand back 3 and mint 2 out of nothing.
export async function refundGeneration(accountId, paidWith, amount = GENERATION_COST) {
  if (paidWith !== "holder") return refundCredits(accountId, amount);
  const today = todayKey();
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u && u.gateDate === today) { u.gateUsed = Math.max(0, (u.gateUsed || 0) - 1); mem.set(accountId, u); }
    return;
  }
  const uref = db.collection("users").doc(accountId);
  const cref = db.collection("counters").doc(`gate-${today}`);
  await db.runTransaction(async (tx) => {
    const usnap = await tx.get(uref);
    const csnap = await tx.get(cref);
    if (!usnap.exists) return;
    const d = usnap.data();
    // Only if the day has not rolled over. After midnight the run
    // belongs to a bucket that no longer exists, and giving it back
    // against today's would be a free extra run.
    if (d.gateDate !== today) return;
    tx.update(uref, { gateUsed: Math.max(0, (d.gateUsed || 0) - 1) });
    const runs = csnap.exists ? csnap.data().runs || 0 : 0;
    tx.set(cref, { day: today, runs: Math.max(0, runs - 1) }, { merge: true });
  });
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
// The Google profile picture, so a feed of posts has faces on it.
//
// A URL, not the image: Google serves these from its own CDN and
// re-hosting them would mean copying, storing and refreshing
// somebody's photo for no gain. A dead link degrades to the
// initial-letter fallback, which is what happens anyway for anyone
// who signed in with a wallet and has no photo at all.
export async function setPhoto(accountId, url) {
  const clean = String(url || "").trim();
  // Only Google's own host. This string ends up in an <img src> on a
  // public page, so it is not a place to accept whatever an ID token
  // happened to carry.
  if (!/^https:\/\/lh\d+\.googleusercontent\.com\//.test(clean)) return;
  const db = getAdminDb();
  if (!db) {
    const u = mem.get(accountId);
    if (u) u.photo = clean.slice(0, 300);
    return;
  }
  await db.collection("users").doc(accountId).set({ photo: clean.slice(0, 300) }, { merge: true });
}

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
  const gateToday = u.gateDate === today;
  const google = identities.find((i) => i.type === "google");
  return {
    accountId: u.id,
    // Kept for the nav, which has always shown a truncated address.
    // Now simply the first paying wallet, and absent for a Google-only
    // account — the UI falls back to the email.
    wallet: (u.wallets || [])[0] || null,
    wallets: u.wallets || [],
    email: u.email || null,
    // Shown on the profile. The handle rides along so /you does not
    // need a second request just to know what to call you.
    handle: u.handle || null,
    photo: u.photo || null,
    hasGoogle: !!google,
    credits: u.credits || 0,
    freeEditsLeft: Math.max(0, FREE_EDITS_PER_DAY - used),
    editCost: EDIT_COST,
    generationCost: GENERATION_COST,
    // Holder standing, read from what the last balance check stored
    // rather than recomputed — nothing here should cost an RPC call.
    // All of it collapses to zero on a new day, so a stale grant can
    // never be displayed as if it were live.
    holderRunsLeft: gateToday ? Math.max(0, (u.gateAllowance || 0) - (u.gateUsed || 0)) : 0,
    holderDailyRuns: gateToday ? u.gateAllowance || 0 : 0,
    holderReason: gateToday ? u.gateReason || null : null,
    holderBalance: Number.isFinite(u.gateBalance) ? u.gateBalance : null,
    holderMaturesAt: gateToday ? u.gateMaturesAt || 0 : 0,
  };
}
