// GET  /api/auth/me     — who am I, and what's my balance?
// POST /api/auth/logout — clear the session.
//
// The balance ALWAYS comes from here, never from anything the client
// kept. That's the whole point of moving credits server-side: the
// browser reports what the server says, rather than deciding.
import { NextResponse } from "next/server";
import { requireUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getUser, publicUser } from "@/lib/users";
import { identitiesFor } from "@/lib/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ ok: true, user: null });

  const user = await getUser(session.accountId);
  // Session valid but no account: signed in before the record was
  // lost (dev restart with the in-memory store, or a deleted doc).
  // Treat it as signed out rather than inventing an account with
  // credits nobody paid for.
  if (!user) {
    const res = NextResponse.json({ ok: true, user: null });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return res;
  }
  return NextResponse.json({ ok: true, user: publicUser(user, await identitiesFor(session.accountId)) });
}
