// GET / POST / DELETE /api/auth/identities — manage the ways into an
// account.
//
// LINKING IS THE POINT, not unlinking. Every account that exists today
// was created with a wallet, which means signing in needs an extension
// and is miserable on a phone. Adding Google to an existing account is
// how those people get the easy door without abandoning their credits.
// It works the other way too: a Google account can add a wallet, so
// that a hand-sent transfer still finds its way home.
//
// Both directions prove ownership the same way the sign-in routes do —
// a verified Google ID token, or an Ed25519 signature over a
// server-issued nonce. Nothing is taken on the client's word.
//
// The account is identified by the SESSION, never by the request body.
// Otherwise "link this identity to that account" would be a request
// anyone could make about anyone.
import { NextResponse } from "next/server";
import { requireUser, verifySignIn } from "@/lib/auth";
import { linkIdentity, unlinkIdentity, identitiesFor } from "@/lib/identities";
import { getUser, publicUser, addPayingWallet, setEmail, setPhoto, claimWalletIdentity } from "@/lib/users";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function respond(accountId, extra = {}) {
  const [user, identities] = await Promise.all([getUser(accountId), identitiesFor(accountId)]);
  return NextResponse.json({
    ok: true,
    identities: identities.map((i) => ({ type: i.type, id: i.id, ts: i.ts || 0 })),
    user: publicUser(user, identities),
    ...extra,
  });
}

export async function GET(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return respond(session.accountId);
}

export async function POST(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const type = String(body?.type || "");

  if (type === "google") {
    const auth = getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Not configured." }, { status: 503 });
    let decoded;
    try {
      decoded = await auth.verifyIdToken(String(body.idToken || ""), true);
    } catch {
      return NextResponse.json({ error: "That sign-in couldn't be verified." }, { status: 401 });
    }
    const res = await linkIdentity("google", decoded.uid, session.accountId);
    if (!res.ok) {
      // Deliberately does NOT say which account holds it. That would
      // confirm to a stranger that a given Google account uses bannr.
      return NextResponse.json(
        { error: "That Google account is already linked to a different bannr account." },
        { status: 409 }
      );
    }
    if (decoded.email) await setEmail(session.accountId, decoded.email);
    if (decoded.picture) await setPhoto(session.accountId, decoded.picture);
    return respond(session.accountId, { linked: "google" });
  }

  if (type === "wallet") {
    const wallet = String(body.wallet || "");
    const ok = await verifySignIn({
      wallet,
      nonce: String(body.nonce || ""),
      signature: String(body.signature || ""),
    });
    if (!ok) {
      return NextResponse.json(
        { error: "That signature couldn't be verified. Please try again." },
        { status: 401 }
      );
    }
    const res = await linkIdentity("wallet", wallet, session.accountId);
    if (!res.ok) {
      // Almost always the same story: this person signed in with
      // this wallet before they had a Google login, so their own
      // wallet is sitting on an account made of nothing but that
      // wallet. They have just proved they hold the key, so it is
      // theirs to move — see claimWalletIdentity for the one
      // condition, and for why an account with another way in is
      // still refused.
      const claim = await claimWalletIdentity(wallet, session.accountId);
      if (!claim.ok) {
        return NextResponse.json(
          {
            error:
              claim.reason === "owned"
                ? "That wallet already signs in to another bannr account that has its own email. Sign in with that one, or remove the wallet from it first."
                : "That wallet couldn't be linked. Try again in a moment.",
            code: claim.reason || "conflict",
          },
          { status: 409 }
        );
      }
      await addPayingWallet(session.accountId, wallet);
      return respond(session.accountId, {
        linked: "wallet",
        // Said out loud, because credits appearing from nowhere is
        // as unsettling as credits vanishing.
        merged: claim.moved || 0,
      });
    }
    // Proving you hold it also says payments from it are yours.
    await addPayingWallet(session.accountId, wallet);
    return respond(session.accountId, { linked: "wallet" });
  }

  return NextResponse.json({ error: "Unknown identity type." }, { status: 400 });
}

export async function DELETE(req) {
  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const res = await unlinkIdentity(String(body?.type || ""), String(body?.id || ""), session.accountId)
    .catch(() => ({ ok: false, reason: "invalid" }));

  if (!res.ok) {
    // "last" is the one worth spelling out — an account with no
    // identities is unreachable and its credits are gone for good.
    const msg =
      res.reason === "last"
        ? "That's the only way into this account. Add another sign-in method first, or you'd lock yourself out."
        : "That sign-in method isn't linked to this account.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return respond(session.accountId, { unlinked: true });
}
