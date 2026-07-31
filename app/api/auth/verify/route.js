// POST /api/auth/verify — step 2 of wallet sign-in.
// Verifies the Ed25519 signature, burns the nonce, creates the
// account if this wallet has never been seen, and sets the session
// cookie. The cookie is httpOnly, so the browser can hold a session
// it can never read or forge.
import { NextResponse } from "next/server";
import { verifySignIn, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getOrCreateUser, publicUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { wallet, nonce, signature } = await req.json();

    const ok = await verifySignIn({
      wallet: String(wallet || ""),
      nonce: String(nonce || ""),
      signature: String(signature || ""),
    });
    // One message for every failure mode — a bad signature, a reused
    // nonce and an expired nonce are all "try again" to an honest
    // user, and distinguishing them only helps someone probing.
    if (!ok) {
      return NextResponse.json(
        { error: "That signature couldn't be verified. Please try connecting again." },
        { status: 401 }
      );
    }

    // First sign-in creates the account and grants free credits, once
    // per wallet — see the idempotency note in lib/users.js.
    const user = await getOrCreateUser(wallet);

    const res = NextResponse.json({ ok: true, user: publicUser(user) });
    res.cookies.set(SESSION_COOKIE, createSession(wallet), sessionCookieOptions);
    return res;
  } catch (err) {
    console.error("[auth/verify]", err);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
