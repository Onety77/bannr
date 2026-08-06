// ============================================================
// THE BUYBACK LEDGER.
//
// Revenue goes to two different wallets, and that separation is the
// whole point of this file:
//
//   TREASURY   credits people paid SOL for. Money from OUTSIDE the
//              token — a customer bought a thing.
//   DEV        creator fees, a cut of trading volume. Money from
//              INSIDE it — traders, recycled back to traders.
//
// Every launch promises fee buybacks and traders discount them
// correctly, because they are circular and they stop the week volume
// does. Almost nothing at this size can buy back with customer money.
// So the two are counted separately and never summed: the fee line
// earns trust, and the product line is the one that still moves on a
// day when the chart does nothing.
//
// NOTHING HERE IS TAKEN ON TRUST. A buyback is recorded by pasting
// its transaction signature; the amounts are then read off the chain,
// not typed in. Every row on the public page links back to the
// explorer, so the figures can be checked by anyone in ten seconds —
// which is the entire difference between a proof and a claim.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

const LAMPORTS = 1e9;
const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;

// Where a burn goes. The incinerator is the conventional Solana burn
// address and, unlike a project treasury, tokens sent there can never
// come back — which is why traders price a burn and discount a
// "locked" treasury.
export const INCINERATOR = "1nc1nerator11111111111111111111111111111111";

export const SOURCES = ["product", "fees"];

async function rpc(method, params) {
  const url = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "bannr", method, params }),
    cache: "no-store",
  });
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || "rpc error");
  return data?.result ?? null;
}

const keyAt = (tx, i) => {
  const k = tx?.transaction?.message?.accountKeys?.[i];
  return typeof k === "string" ? k : k?.pubkey;
};

// SOL that LEFT this wallet, from the balance deltas rather than by
// reading instructions — correct however the swap was routed.
function solSpent(tx, wallet) {
  const keys = tx?.transaction?.message?.accountKeys || [];
  const idx = keys.findIndex((k) => (typeof k === "string" ? k : k?.pubkey) === wallet);
  if (idx < 0) return 0;
  const pre = tx?.meta?.preBalances?.[idx];
  const post = tx?.meta?.postBalances?.[idx];
  if (typeof pre !== "number" || typeof post !== "number") return 0;
  // Positive means it went out. The fee is included, which is honest:
  // it is money spent on the buyback.
  return Math.max(0, (pre - post) / LAMPORTS);
}

// Tokens of `mint` that this wallet GAINED, again from balances.
function tokensGained(tx, wallet, mint) {
  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];
  const amount = (rows) =>
    rows
      .filter((b) => b.mint === mint && (b.owner === wallet || keyAt(tx, b.accountIndex) === wallet))
      .reduce((sum, b) => sum + Number(b.uiTokenAmount?.uiAmount || 0), 0);
  return Math.max(0, amount(post) - amount(pre));
}

// Tokens of `mint` sent to the incinerator, OR removed from supply by
// a burn instruction. Both are real burns; only the first shows up as
// a balance gain somewhere.
function tokensBurned(tx, mint) {
  const gained = tokensGained(tx, INCINERATOR, mint);
  if (gained > 0) return gained;

  // A true burn instruction destroys supply, so no account gains.
  // Compare the mint's total across pre and post instead.
  const total = (rows) =>
    (rows || []).filter((b) => b.mint === mint)
      .reduce((sum, b) => sum + Number(b.uiTokenAmount?.uiAmount || 0), 0);
  const before = total(tx?.meta?.preTokenBalances);
  const after = total(tx?.meta?.postTokenBalances);
  return Math.max(0, before - after);
}

// Read a signature and work out what it did. Returns { ok, ... } so a
// caller can show exactly why something was refused rather than a
// generic failure.
export async function inspect(signature, { mint, wallet }) {
  if (!SIG_RE.test(String(signature || "").trim())) {
    return { ok: false, error: "That doesn't look like a transaction signature." };
  }
  if (!mint) return { ok: false, error: "Set the token's contract address first." };

  let tx;
  try {
    tx = await rpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
  } catch (e) {
    return { ok: false, error: "Couldn't reach the network. Try again in a moment." };
  }
  if (!tx) return { ok: false, error: "That transaction hasn't landed yet, or doesn't exist." };
  if (tx?.meta?.err) return { ok: false, error: "That transaction failed on-chain." };

  const sol = wallet ? solSpent(tx, wallet) : 0;
  const bought = wallet ? tokensGained(tx, wallet, mint) : 0;
  const burned = tokensBurned(tx, mint);

  if (!bought && !burned) {
    return { ok: false, error: "That transaction doesn't buy or burn this token." };
  }

  // ══ A BUYBACK AND A BURN ARE USUALLY TWO TRANSACTIONS ══
  //
  // You swap SOL for the token, then you send it to the incinerator.
  // Both get logged, and each row says what ITS transaction did rather
  // than pretending to be half of something.
  //
  // Both matter, and they prove different things. The burn is the
  // supply that is gone — the number a holder cares about. The swap is
  // where the SOL came from, which is what makes "bought back with
  // banner revenue" a claim rather than an assertion. Logging only the
  // burn leaves the money unexplained; logging only the swap leaves
  // tokens sitting in a wallet that could come back.
  const kind = bought && burned ? "both" : burned ? "burn" : "buy";

  return {
    ok: true,
    signature: String(signature).trim(),
    kind,
    sol: Math.round(sol * 1e6) / 1e6,
    bought: Math.round(bought * 1e6) / 1e6,
    burned: Math.round(burned * 1e6) / 1e6,
    ts: (tx.blockTime || Math.floor(Date.now() / 1000)) * 1000,
  };
}

// Recorded under the SIGNATURE, so logging the same transaction twice
// is a no-op rather than double-counting it.
export async function record({ signature, source, mint, wallet }) {
  const db = getAdminDb();
  if (!db) return { ok: false, error: "Not configured." };
  if (!SOURCES.includes(source)) return { ok: false, error: "Unknown source." };

  const found = await inspect(signature, { mint, wallet });
  if (!found.ok) return found;

  await db.collection("buybacks").doc(found.signature).set({ ...found, source, mint }, { merge: true });
  return { ok: true, entry: { ...found, source } };
}

export async function remove(signature) {
  const db = getAdminDb();
  if (!db) return false;
  await db.collection("buybacks").doc(String(signature)).delete().catch(() => {});
  return true;
}

// Everything, newest first, plus a total per source.
//
// No where() and no composite index — one orderBy on a small
// collection. See the note at the top of lib/feed.js for why that
// matters more than it looks.
export async function ledger(limit = 100) {
  const db = getAdminDb();
  if (!db) return { entries: [], totals: blank() };
  let snap;
  try {
    snap = await db.collection("buybacks").orderBy("ts", "desc").limit(limit).get();
  } catch {
    return { entries: [], totals: blank() };
  }
  const entries = snap.docs.map((d) => d.data());
  const totals = blank();
  for (const e of entries) {
    const t = totals[e.source] || totals.product;
    t.sol += e.sol || 0;
    t.bought += e.bought || 0;
    t.burned += e.burned || 0;
    t.count += 1;
  }
  return { entries, totals };
}

function blank() {
  return {
    product: { sol: 0, bought: 0, burned: 0, count: 0 },
    fees: { sol: 0, bought: 0, burned: 0, count: 0 },
  };
}

// What customers have actually paid us, from our own payment records.
//
// Every row carries the signature it was claimed with, so this is
// checkable even though the sum is ours — which is the honest middle
// between "trust our database" and scanning the whole chain on every
// page load.
export async function productRevenue() {
  const db = getAdminDb();
  if (!db) return { sol: 0, count: 0 };
  try {
    const snap = await db.collection("payments").limit(1000).get();
    let sol = 0;
    // BOTH names. The webhook writes `amountSol` and the claim route
    // writes `sol`; they are the same figure under two spellings, and
    // reading one would quietly halve the total depending on which
    // path each buyer happened to take.
    snap.docs.forEach((d) => {
      const p = d.data() || {};
      sol += Number(p.sol ?? p.amountSol ?? 0);
    });
    return { sol: Math.round(sol * 1e6) / 1e6, count: snap.size };
  } catch {
    return { sol: 0, count: 0 };
  }
}
