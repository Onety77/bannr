// Single source of truth for who's allowed into /admin7731. Not a
// secret by itself — the real gate is Firebase Auth + the server
// verifying this email on every admin request (see lib/adminAuth.js).
export const ADMIN_EMAIL = "aminualimy@gmail.com";

// Who may mint test credits at /api/dev/grant.
//
// A SEPARATE list from ADMIN_EMAIL on purpose. These are two different
// powers and they should not travel together: topping up your own test
// balance is a convenience, while /admin7731 decides what appears on
// the homepage and can read the refusal log. A partner who needs to
// test the product does not need either of those, and bundling them
// would mean the only way to let someone try the app is to hand them
// the moderation controls.
//
// Only has any effect at all where the route is switched on — locally,
// or on a deployment that sets NEXT_PUBLIC_ENABLE_TEST_CREDITS=1. It
// is the inner gate, not the outer one.
//
// DELETE THIS LIST BEFORE REAL PAYMENTS GO LIVE. Every address here
// can create credits from nothing.
export const TEST_CREDIT_EMAILS = [
  ADMIN_EMAIL,
  "nolclub2026@gmail.com",   // owner, second Google account
  "aminubello2468@gmail.com", // owner, third Google account
  "jermainbim@gmail.com",     // partner, testing
];

// Accounts created before Google sign-in existed have NO email at all —
// they are identified by the wallet that made them. An email-only check
// silently locked every one of them out, which is a whole class of test
// account that predates the feature being used to gate it.
//
// Empty by default. The better route for a wallet-only account is to
// link a Google identity on the settings page, which brings it under
// the list above and needs no code change at all; this exists for the
// case where that is not practical.
export const TEST_CREDIT_WALLETS = [];

// Takes the whole account, not one field, so it can answer for every
// kind of account rather than the kind that happened to exist when it
// was written.
export function canMintTestCredits(user) {
  if (!user) return false;
  if (user.email && TEST_CREDIT_EMAILS.includes(user.email.toLowerCase())) return true;
  return (user.wallets || []).some((w) => TEST_CREDIT_WALLETS.includes(w));
}
