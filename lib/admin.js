// Single source of truth for who's allowed into /admin7731. Not a
// secret by itself — the real gate is Firebase Auth + the server
// verifying this email on every admin request (see lib/adminAuth.js).
export const ADMIN_EMAIL = "aminualimy@gmail.com";
