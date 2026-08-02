#!/usr/bin/env node
// ============================================================
// Remove seeded test documents from the payments collection.
//
// The collection was populated during development with fabricated
// records — sig_big_*, sig_builder_*, sig_custom_*, sig_unlinked_*.
// They are attached to real accounts, so once the account page shows
// billing history they appear as purchases that never happened, with
// SOL amounts nobody ever paid.
//
// HOW A REAL ONE IS TOLD APART: a genuine payment document is keyed by
// its Solana transaction signature — base58, 64 bytes, 86–90 chars.
// Anything whose id is not that shape cannot be a real transaction,
// because that id is what makes the record idempotent in the first
// place. This script deletes ONLY documents failing that test, so it
// cannot touch a real purchase even if run by accident.
//
// It writes a JSON backup before deleting anything, so a mistake is
// recoverable rather than final.
//
//   node scripts/clean-test-payments.cjs           (dry run)
//   node scripts/clean-test-payments.cjs --commit  (back up, then delete)
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
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set.");
  process.exit(1);
}

const admin = require(path.join(ROOT, "node_modules", "firebase-admin"));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = admin.firestore();

const REAL_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;

(async () => {
  console.log(COMMIT ? "COMMIT — will back up, then delete\n" : "DRY RUN — nothing will be deleted (pass --commit)\n");

  const snap = await db.collection("payments").get();
  const doomed = snap.docs.filter((d) => !REAL_SIGNATURE.test(d.id));
  const kept = snap.size - doomed.length;

  for (const d of doomed) {
    const x = d.data();
    console.log(`  delete ${d.id}  (${x.amountSol ?? x.sol} SOL, ${x.creditsGranted} credits, ${x.status})`);
  }

  if (!doomed.length) {
    console.log("  nothing to delete — every payment id is a real signature");
    process.exit(0);
  }

  if (COMMIT) {
    const backup = path.join(ROOT, `payments-backup-${Date.now()}.json`);
    fs.writeFileSync(
      backup,
      JSON.stringify(doomed.map((d) => ({ id: d.id, data: d.data() })), null, 2),
      "utf8"
    );
    console.log(`\n  backup written: ${path.basename(backup)}`);

    const batch = db.batch();
    doomed.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log("  deleted.");
  }

  console.log(`\nsummary`);
  console.log(`  deleted  ${doomed.length}`);
  console.log(`  kept     ${kept}   (real signatures)`);
  console.log(COMMIT ? "\nDone. Credit balances were NOT touched — only the records." : "\nNothing was deleted. Re-run with --commit.");
  process.exit(0);
})().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
