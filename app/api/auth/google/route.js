// POST /api/auth/google — sign in with a Google account.
//
// The client does the OAuth dance with Firebase Auth and hands us the
// resulting ID token. We verify it with the Admin SDK — never trusting
// anything the browser claims about who it is — resolve the Google uid
// to an account, and set the same session cookie the wallet path sets.
// Downstream nothing knows or cares which door was used.
//
// Why the uid and not the email: emails get recycled and changed, and
// two providers can report the same address. The Firebase uid is
// stable for the life of the account, so it is the identity. The email
// is stored alongside it purely so we have somewhere to send a receipt.
import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getOrCreateByIdentity, publicUser, setEmail } from "@/lib/users";
import { identitiesFor } from "@/lib/identities";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Sign-in is not configured yet. Please try again shortly." },
        { status: 503 }
      );
    }

    const { idToken } = await req.json();
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 400 });
    }

    let decoded;
    try {
      // checkRevoked: a token from a session the user has since signed
      // out of everywhere should not still open their account.
      decoded = await auth.verifyIdToken(idToken, true);
    } catch {
      // One message for every failure — expired, forged, revoked and
      // wrong-project are all "try again" to an honest user, and
      // telling them apart only helps someone probing.
      return NextResponse.json(
        { error: "That sign-in couldn't be verified. Please try again." },
        { status: 401 }
      );
    }

    const uid = decoded.uid;
    if (!uid) {
      return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 401 });
    }

    const user = await getOrCreateByIdentity("google", uid);
    if (decoded.email) await setEmail(user.id, decoded.email);

    const res = NextResponse.json({
      ok: true,
      user: publicUser({ ...user, email: decoded.email || user.email || null }, await identitiesFor(user.id)),
    });
    res.cookies.set(SESSION_COOKIE, createSession(user.id), sessionCookieOptions);
    return res;
  } catch (err) {
    console.error("[auth/google]", err);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
