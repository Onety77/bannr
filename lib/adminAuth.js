// Server-side gate for every /api/admin/* route. Never trust the
// client's own email check — a request could be crafted by hand.
// Verifies the Firebase ID token itself and checks the *decoded,
// signed* email against ADMIN_EMAIL.
import "server-only";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { ADMIN_EMAIL } from "@/lib/admin";

export async function requireAdmin(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const auth = getAdminAuth();
  if (!auth) return null;

  try {
    const decoded = await auth.verifyIdToken(token);
    if (decoded.email_verified && decoded.email === ADMIN_EMAIL) return decoded;
    return null;
  } catch {
    return null;
  }
}
