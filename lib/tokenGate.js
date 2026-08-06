// ============================================================
// TOKEN GATE — free daily generations for people holding $BANNR.
//
// WHY A WALLET AND A GOOGLE ACCOUNT ARE NOT THE SAME THING, AND WHY
// THAT IS THE WHOLE SECURITY MODEL:
//
// An account is who you are. A wallet is what you hold. They are
// separate records on purpose (see lib/identities.js), and this
// feature is the first thing that genuinely needs both at once —
// we have to know WHICH ACCOUNT to credit, and WHICH WALLET to read
// a balance from.
//
// The join is an identity: `identities/wallet:{address} -> accountId`,
// written only after an Ed25519 signature over a server-issued nonce.
// linkIdentity is transactional and REFUSES to re-point an identity
// that already belongs to someone else. That one existing rule is the
// entire defence against the obvious attack — buy once, sign into
// fifty Google accounts, collect fifty allowances. A wallet can fund
// exactly one account's benefits, permanently, and no amount of
// re-signing changes that.
//
// CALLERS MUST PASS lib/identities.js -> linkedWallets(). There is
// a second, very similar list on the account — users/{id}.wallets —
// and it is the wrong one. That array means "payments from here
// belong to this account"; /api/pay/claim appends a sender to it
// with no signature and no exclusivity check, so paying the same
// wallet into two accounts puts one address in both. Summing over
// it would hand one bag of tokens an allowance on every account it
// had ever paid for. Nothing in this file can tell the two lists
// apart, so the distinction is the caller's to get right.
//
// So: sign in however you like (Google is the easy door), connect a
// wallet to prove what you hold, and the two are bound. Balances
// across every linked wallet are SUMMED, which is safe precisely
// because each of those wallets is exclusive to this account.
//
// WHAT THIS DOES NOT STOP, stated plainly rather than discovered
// later: passing the same bag between fresh wallets. Wallet A
// qualifies, generates, sends the tokens to wallet B on a new
// account, repeat. A Solana transfer costs a fraction of a cent, so
// linking alone does not price that out. Three things do:
//
//   1. maturityHours — a wallet must have been SEEN holding for this
//      long before it pays out. The clock is per wallet and resets if
//      the balance drops below the bar, so a moving bag never matures
//      anywhere. Turns "one bag, many accounts, today" into "one bag
//      per wallet per maturity window", i.e. it costs capital x time
//      instead of capital once.
//   2. dailyGlobalRuns — a hard ceiling on free runs across everyone,
//      every day. This is the only number that GUARANTEES the bill,
//      whatever anyone invents. Set it and you cannot be surprised.
//   3. The admin panel, so every number above moves in seconds.
//
// EVERYTHING IS OFF BY DEFAULT. No mint, not enabled, nothing
// announced. Until an admin fills this in the gate is inert and the
// credits path behaves exactly as it does today.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const GATE_DOC = "tokenGate";

// A run's real cost varies with how many options it renders (1-4), so
// the ceiling is counted in RUNS and should be set against the worst
// case, not the average. At ~$0.073 for a three-option run, 500 free
// runs a day is roughly $36/day.
export const DEFAULT_GATE = {
  enabled: false,        // master switch for the free-generation gate
  announced: false,      // show the contract address publicly
  mint: "",              // the token's contract address
  symbol: "BANNR",
  name: "",              // optional display name beside the ticker
  minTokens: 0,          // whole tokens required, NOT a dollar amount
  dailyRuns: 20,         // free runs per qualifying account per day
  maturityHours: 0,      // hours a wallet must hold before it pays out
  dailyGlobalRuns: 0,    // 0 = no ceiling; any other number is a hard cap
  recheckMinutes: 10,    // how soon a non-qualifying account is re-read
  // The floor for appearing on /token as a live project. Editable
  // because the right number is something you learn during a launch,
  // and needing a deploy to change it means it never gets tuned.
  dirMinMarketCap: 15000,
  note: "",              // one line shown to holders, admin-authored
};

const NUMERIC = {
  minTokens:       { min: 0, max: 1e15 },
  dailyRuns:       { min: 0, max: 500 },
  maturityHours:   { min: 0, max: 720 },
  dailyGlobalRuns: { min: 0, max: 100000 },
  recheckMinutes:  { min: 1, max: 1440 },
  dirMinMarketCap: { min: 0, max: 1e9 },
};

// Solana addresses are base58, 32-44 chars. Checked because this
// string is interpolated into an RPC call and rendered as the thing
// people will copy and paste money at.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isAddress = (s) => BASE58.test(String(s || "").trim());

export function cleanGate(raw = {}) {
  const out = { ...DEFAULT_GATE };
  for (const [k, { min, max }] of Object.entries(NUMERIC)) {
    const n = Number(raw[k]);
    out[k] = Number.isFinite(n) ? Math.min(Math.max(n, min), max) : DEFAULT_GATE[k];
  }
  const mint = String(raw.mint || "").trim();
  out.mint = isAddress(mint) ? mint : "";
  out.symbol = String(raw.symbol || "").trim().slice(0, 12).toUpperCase() || DEFAULT_GATE.symbol;
  out.name = String(raw.name || "").trim().slice(0, 40);
  out.note = String(raw.note || "").trim().slice(0, 200);
  out.announced = Boolean(raw.announced);
  // A gate with no mint or no threshold cannot be satisfied by anyone,
  // and an "enabled" switch that silently grants nothing is worse than
  // an honest off. Both are required for enabled to mean anything.
  out.enabled = Boolean(raw.enabled) && Boolean(out.mint) && out.minTokens > 0 && out.dailyRuns > 0;
  return out;
}

// ---------- config ----------
//
// Read on every generation, so it is cached briefly. The window is
// short enough that turning the gate off in an emergency takes effect
// in seconds, and saving always clears it outright.
let cache = { at: 0, value: null };
const CACHE_MS = 30_000;

export function clearGateCache() {
  cache = { at: 0, value: null };
}

export async function getGate({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const db = getAdminDb();
  if (!db) return { ...DEFAULT_GATE };
  try {
    const snap = await db.collection("config").doc(GATE_DOC).get();
    const value = cleanGate(snap.exists ? snap.data() : {});
    cache = { at: Date.now(), value };
    return value;
  } catch {
    // Never let a config read failure become an outage. Falling back
    // to the defaults means the gate is OFF, which fails toward
    // charging credits rather than toward giving work away.
    return { ...DEFAULT_GATE };
  }
}

export async function saveGate(raw, by = "") {
  const db = getAdminDb();
  if (!db) return null;
  const value = cleanGate(raw);
  await db.collection("config").doc(GATE_DOC).set(
    { ...value, updatedAt: Date.now(), updatedBy: String(by || "").slice(0, 120) },
    { merge: true }
  );
  clearGateCache();
  return value;
}

// What the public is allowed to know. Deliberately omits the ceiling
// and the recheck window: those are levers, and publishing them tells
// anyone farming exactly what they are working against.
export function publicGate(g) {
  return {
    live: g.enabled,
    announced: g.announced,
    mint: g.announced ? g.mint : "",
    symbol: g.symbol,
    name: g.name,
    minTokens: g.enabled ? g.minTokens : 0,
    dailyRuns: g.enabled ? g.dailyRuns : 0,
    maturityHours: g.enabled ? g.maturityHours : 0,
    note: g.note,
  };
}

// ---------- balances ----------

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";
const RPC_TIMEOUT_MS = 6000;

// Total of this mint held by one wallet, as a plain number of whole
// tokens. null means WE DO NOT KNOW — an RPC failure, a timeout, a
// malformed reply. Callers must treat null as "not qualified" and
// never as zero-with-confidence, because the two lead to different
// messages and only one of them is honest.
//
// Summed across token accounts: one owner can legitimately hold the
// same mint in more than one account, and reading only the first
// would under-report a real holder.
export async function readBalance(wallet, mint) {
  if (!isAddress(wallet) || !isAddress(mint)) return null;
  const rpc = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "bannr-gate",
        // Filtering by mint rather than by program id, so this works
        // for both the classic token program and Token-2022 without
        // needing to know which one the mint was created under.
        method: "getTokenAccountsByOwner",
        params: [wallet, { mint }, { encoding: "jsonParsed" }],
      }),
    });
    const data = await res.json();
    const list = data?.result?.value;
    if (!Array.isArray(list)) return null;
    let total = 0;
    for (const acc of list) {
      const amt = acc?.account?.data?.parsed?.info?.tokenAmount;
      // uiAmountString rather than uiAmount: the string is exact, and
      // the float is the one that has ever surprised anybody.
      const n = Number(amt?.uiAmountString ?? amt?.uiAmount ?? 0);
      if (Number.isFinite(n)) total += n;
    }
    return total;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- maturity ----------
//
// One document per wallet per mint, holding the moment this wallet was
// FIRST seen at or above the bar. The clock resets the instant it
// falls below, so a bag being passed from wallet to wallet never
// matures anywhere — which is the entire point. Also doubles as the
// audit trail for who is claiming.
async function touchHolder(db, mint, wallet, accountId, balance, min) {
  const ref = db.collection("holders").doc(`${mint}:${wallet}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : null;
    const over = balance >= min;
    // Kept if they were already over the bar and still are; started
    // fresh on the transition from under to over.
    const since = over ? (prev?.qualifiedSince && prev?.qualified ? prev.qualifiedSince : now) : 0;
    tx.set(
      ref,
      {
        mint, wallet, accountId,
        balance, qualified: over,
        qualifiedSince: since,
        checkedAt: now,
      },
      { merge: true }
    );
    return since;
  });
}

// ---------- the decision ----------
//
// Returns everything the caller needs to explain itself, because "you
// don't qualify" with no reason is the kind of message that generates
// support messages at 3am.
//
//   { qualified, balance, min, wallet, reason, maturesAt }
//
// reason: "ok" | "off" | "no-wallet" | "short" | "maturing" | "unknown"
export async function evaluate(accountId, wallets, gate) {
  const g = gate || (await getGate());
  if (!g.enabled) return { qualified: false, reason: "off", balance: 0, min: 0 };

  const list = (wallets || []).filter(isAddress);
  if (!list.length) return { qualified: false, reason: "no-wallet", balance: 0, min: g.minTokens };

  // Safe to sum ONLY because every address here is signature-proven
  // and exclusive to this account — see the note at the top of this
  // file about which list the caller has to pass.
  const reads = await Promise.all(list.map((w) => readBalance(w, g.mint)));
  const known = reads.filter((n) => n !== null);
  if (!known.length) {
    // Every read failed. Not the same as holding nothing, and it must
    // not read that way to the person on the other end.
    return { qualified: false, reason: "unknown", balance: 0, min: g.minTokens };
  }
  const balance = known.reduce((a, b) => a + b, 0);

  // The wallet credited with the position is the biggest one — it is
  // what maturity is tracked against, and what the UI names.
  let best = list[0], bestAmt = -1;
  list.forEach((w, i) => {
    const n = reads[i];
    if (n !== null && n > bestAmt) { bestAmt = n; best = w; }
  });

  if (balance < g.minTokens) {
    const db = getAdminDb();
    if (db) await touchHolder(db, g.mint, best, accountId, bestAmt < 0 ? 0 : bestAmt, g.minTokens).catch(() => {});
    return { qualified: false, reason: "short", balance, min: g.minTokens, wallet: best };
  }

  if (g.maturityHours > 0) {
    const db = getAdminDb();
    if (db) {
      const since = await touchHolder(db, g.mint, best, accountId, bestAmt, g.minTokens).catch(() => 0);
      const readyAt = (since || Date.now()) + g.maturityHours * 3600_000;
      if (Date.now() < readyAt) {
        return { qualified: false, reason: "maturing", balance, min: g.minTokens, wallet: best, maturesAt: readyAt };
      }
    }
  } else {
    const db = getAdminDb();
    if (db) await touchHolder(db, g.mint, best, accountId, bestAmt, g.minTokens).catch(() => {});
  }

  return { qualified: true, reason: "ok", balance, min: g.minTokens, wallet: best };
}
