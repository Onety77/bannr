// ============================================================
// READING A PAYMENT OFF THE CHAIN — shared by the two routes that
// credit one: /api/pay/claim and the Helius webhook.
//
// Both must reach their answer from the transaction itself, never from
// what arrived in a request. The claim route always did. The webhook
// used to take the amount and the sender from Helius's POST body, which
// is only as trustworthy as the shared secret guarding it: anyone
// holding that secret could post a payment that never happened and be
// credited for it. Reading the transaction by signature makes the
// secret decide only WHETHER a payment is looked at, never what it is
// worth.
// ============================================================
import "server-only";

const PUBLIC_FALLBACK = "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1e9;

// Signatures are base58, 64 bytes — 87 or 88 characters. Checked
// before it reaches the RPC so obvious junk costs us nothing.
export const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;

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

// The confirmed transaction, or null when the chain does not have it
// (yet). Throws when the RPC itself could not be reached.
export function getTransaction(signature) {
  return rpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);
}

// How much the treasury actually gained, in SOL. Taken from the
// balance deltas rather than by parsing instructions, so it is correct
// no matter how the transfer was constructed.
export function treasuryGain(tx, treasury) {
  const keys = tx?.transaction?.message?.accountKeys || [];
  const idx = keys.findIndex((k) => (typeof k === "string" ? k : k?.pubkey) === treasury);
  if (idx < 0) return 0;
  const pre = tx?.meta?.preBalances?.[idx];
  const post = tx?.meta?.postBalances?.[idx];
  if (typeof pre !== "number" || typeof post !== "number") return 0;
  return (post - pre) / LAMPORTS;
}

// The fee payer — the first account key, which must have signed.
export function senderOf(tx) {
  return (tx?.transaction?.message?.accountKeys || [])
    .map((k) => (typeof k === "string" ? k : k?.pubkey))
    .find(Boolean) || "";
}

// The memo rides in its own instruction. Helius returns parsed
// instructions for the memo program, and the log line is a reliable
// second source when parsing is unavailable.
export function readMemo(tx) {
  const parsed = tx?.transaction?.message?.instructions || [];
  const inner = (tx?.meta?.innerInstructions || []).flatMap((i) => i.instructions || []);
  for (const ix of [...parsed, ...inner]) {
    if (ix?.program === "spl-memo" && typeof ix.parsed === "string") return ix.parsed;
    if (typeof ix?.parsed === "string" && ix?.programId?.includes?.("Memo")) return ix.parsed;
  }
  for (const line of tx?.meta?.logMessages || []) {
    const m = line.match(/Program log: Memo \(len \d+\): "(.*)"$/);
    if (m) return m[1];
  }
  return null;
}
