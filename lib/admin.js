// Single source of truth for who's allowed into /admin7731. Not a
// secret by itself — the real gate is Firebase Auth + the server
// verifying this email on every admin request (see lib/adminAuth.js).
export const ADMIN_EMAIL = "aminualimy@gmail.com";

// TEST_CREDIT_EMAILS / TEST_CREDIT_WALLETS / canMintTestCredits used
// to live here, listing four addresses that could mint credits from
// nothing at /api/dev/grant. Both the list and the route are gone.
//
// They were a convenience that outgrew its gate: the route checked an
// environment flag and then this list, the flag got set on the live
// site, and an audit found 1,404 credits minted across eight accounts
// against zero real payments — one of them an account nobody
// recognised. The list was the inner gate and it was never the
// problem; a standing power to create money is.
//
// Credits are granted from /admin7731 now — to a named recipient,
// with a reason, written to `grants` so any balance can be explained
// later. See /api/admin/grant. That is also the airdrop tool: buying
// credits with our own SOL to hand out would just be paying our own
// treasury, so a reward is simply credits granted.
