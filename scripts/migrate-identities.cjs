#!/usr/bin/env node
// ============================================================
// MIGRATION — give every existing account an identity record.
//
// PURELY ADDITIVE. It creates documents; it never edits, moves or
// deletes an account, and it never touches a credit balance. That is
// deliberate and it is why this is safe to run on live data: the
// accounts that exist keep their document id, which happens to be a
// wallet address, and a wallet address is a perfectly good opaque
// account id. Nothing had to move.
//
// It writes two things:
//   1. identities/wallet:<address> -> { accountId }
//      so that address now opens the account it always opened.
//   2. payments/<sig>.accountId, copied from the existing userId,
//      so billing history — which now queries by account — still
//      finds purchases made before the split.
//
// Safe to run repeatedly: every write is a create-if-absent.
//
//   node scripts/migrate-identities.cjs --dry     (default: shows only)
//   node scripts/migrate-identities.cjs --commit  (actually writes)
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const COMMIT = process.argv.includes("--commit");

for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([\s\S]*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set. Run this where .env.local lives.");
  process.exit(1);
}

const admin = require(path.join(ROOT, "node_modules", "firebase-admin"));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

// A Solana address: base58, 32–44 chars. Legacy account ids are
// addresses; anything else is already a post-split account and needs
// no wallet identity.
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

(async () => {
  console.log(COMMIT ? "COMMIT — writing\n" : "DRY RUN — nothing will be written (pass --commit)\n");

  const users = await db.collection("users").get();
  let linked = 0, already = 0, skipped = 0, walletsBackfilled = 0;

  for (const doc of users.docs) {
    const id = doc.id;
    const d = doc.data();

    if (!ADDR.test(id)) { skipped++; continue; }

    const key = `wallet:${id}`;
    const ref = db.collection("identities").doc(key);
    const existing = await ref.get();

    if (existing.exists) {
      if (existing.data().accountId !== id) {
        console.error(`  !! ${key} already points at ${existing.data().accountId}, expected ${id} — LEFT ALONE`);
      }
      already++;
    } else {
      console.log(`  link ${key.slice(0, 26)}…  -> account ${id.slice(0, 10)}…  (credits ${d.credits})`);
      if (COMMIT) await ref.set({ accountId: id, type: "wallet", ts: Date.now(), migrated: true });
      linked++;
    }

    // Pre-split accounts were created before `wallets` was written, so
    // some have an empty array. Their own address belongs in it, or the
    // webhook backstop can never match them.
    const wallets = d.wallets || [];
    if (!wallets.includes(id)) {
      console.log(`  wallets[] += own address for ${id.slice(0, 10)}…`);
      if (COMMIT) await doc.ref.update({ wallets: [...wallets, id] });
      walletsBackfilled++;
    }
  }

  // Billing history now queries payments by accountId.
  const pays = await db.collection("payments").get();
  let payFixed = 0, payOk = 0, payOrphan = 0;
  for (const doc of pays.docs) {
    const d = doc.data();
    if (d.accountId) { payOk++; continue; }
    const accountId = d.userId || null;
    if (!accountId) { payOrphan++; continue; }   // unclaimed — nothing to attribute yet
    console.log(`  payment ${doc.id.slice(0, 12)}…  accountId <- ${accountId.slice(0, 10)}…`);
    if (COMMIT) await doc.ref.update({ accountId });
    payFixed++;
  }

  console.log("\nsummary");
  console.log(`  accounts            ${users.size}`);
  console.log(`  identities created  ${linked}`);
  console.log(`  already linked      ${already}`);
  console.log(`  non-wallet ids      ${skipped}   (created after the split — nothing to do)`);
  console.log(`  wallets[] backfilled ${walletsBackfilled}`);
  console.log(`  payments updated    ${payFixed}`);
  console.log(`  payments already ok ${payOk}`);
  console.log(`  payments unclaimed  ${payOrphan}   (no account yet — the claim flow handles these)`);
  console.log(COMMIT ? "\nDone." : "\nNothing was written. Re-run with --commit.");
  process.exit(0);
})().catch((e) => {
  console.error("\nMIGRATION FAILED:", e.message);
  console.error("Nothing is half-done — every write is an independent create-if-absent, so re-running is safe.");
  process.exit(1);
});
