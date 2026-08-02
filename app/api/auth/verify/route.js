// POST /api/auth/verify — step 2 of wallet sign-in.
// Verifies the Ed25519 signature, burns the nonce, creates the
// account if this wallet has never been seen, and sets the session
// cookie. The cookie is httpOnly, so the browser can hold a session
// it can never read or forge.
import { NextResponse } from "next/server";
import { verifySignIn, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getOrCreateByIdentity, publicUser, addPayingWallet } from "@/lib/users";
import { identitiesFor } from "@/lib/identities";

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

    // The signature proved they hold this address. That address is an
    // IDENTITY now, not the account itself — it resolves to an account
    // id, creating one on first sight. Free credits are granted with
    // the account, so linking this wallet to an existing Google account
    // later never grants them twice.
    const user = await getOrCreateByIdentity("wallet", wallet);
    // Signing in from a wallet also says "payments from here are mine".
    await addPayingWallet(user.id, wallet);

    const res = NextResponse.json({
      ok: true,
      user: publicUser(user, await identitiesFor(user.id)),
    });
    res.cookies.set(SESSION_COOKIE, createSession(user.id), sessionCookieOptions);
    return res;
  } catch (err) {
    console.error("[auth/verify]", err);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
