// POST /api/auth/handoff/claim — spend a handoff token for a session.
//
// Deliberately NOT authenticated: the token IS the authentication.
// That is what lets a wallet's in-app browser, which has none of the
// original browser's cookies, end up signed in as the same account
// instead of creating a second one.
//
// The token is burned inside a transaction, so two tabs opening the
// same deeplink cannot both claim it, and a link forwarded to someone
// else is already spent.
import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { claimHandoff } from "@/lib/handoff";
import { getUser, publicUser } from "@/lib/users";
import { identitiesFor } from "@/lib/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const accountId = await claimHandoff(body?.token).catch(() => null);
  // One message for expired, spent and invented — they are all "start
  // again" to an honest user, and distinguishing them only helps
  // somebody guessing.
  if (!accountId) {
    return NextResponse.json({ error: "That link has expired. Try connecting again." }, { status: 401 });
  }

  const user = await getUser(accountId);
  if (!user) return NextResponse.json({ error: "That link has expired. Try connecting again." }, { status: 401 });

  const res = NextResponse.json({
    ok: true,
    user: publicUser(user, await identitiesFor(accountId)),
  });
  res.cookies.set(SESSION_COOKIE, createSession(accountId), sessionCookieOptions);
  return res;
}
