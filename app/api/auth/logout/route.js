// POST /api/auth/logout — clear the session cookie.
// Disconnecting the wallet in the extension does NOT end the session
// on its own: the session is ours, not the wallet's, so signing out
// has to be an explicit call.
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
