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
  "jermainbim@gmail.com", // partner, testing
];

export function canMintTestCredits(email) {
  return Boolean(email) && TEST_CREDIT_EMAILS.includes(email.toLowerCase());
}
