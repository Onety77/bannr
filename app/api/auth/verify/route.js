// POST /api/auth/verify — step 2 of wallet sign-in.
// Verifies the Ed25519 signature, burns the nonce, creates the
// account if this wallet has never been seen, and sets the session
// cookie. The cookie is httpOnly, so the browser can hold a session
// it can never read or forge.
import { NextResponse } from "next/server";
import { verifySignIn, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getByIdentity, publicUser, addPayingWallet } from "@/lib/users";
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

    // The signature proved they hold this address. It resolves to an
    // account — but it NO LONGER CREATES ONE.
    //
    // Google is the only door now. An account reached solely by a
    // wallet lives and dies with that seed phrase: lose it and the
    // credits, the banners and the handle go with it, and there is
    // nothing we can do because there is nothing else that identifies
    // them. That was survivable when signing up cost nothing; it is
    // not survivable now that an account holds money and a token
    // allowance.
    //
    // Wallets that ALREADY open an account keep working — every
    // account that existed before this change was made with one, and
    // shutting that door would lock those people out of their own
    // credits to solve a problem they do not have.
    const user = await getByIdentity("wallet", wallet);
    if (!user) {
      return NextResponse.json(
        {
          error:
            "This wallet isn't linked to an account yet. Sign in with Google first, then connect it — that way your credits survive losing a device.",
          code: "needs_google",
        },
        { status: 403 }
      );
    }
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
