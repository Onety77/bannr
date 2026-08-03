// POST /api/dev/grant — DEVELOPMENT ONLY.
//
// Credits can no longer be minted by the client, which is the whole
// point of moving them server-side. That leaves no way to top up
// until the treasury wallet and Helius webhook are configured, so
// this exists purely to keep local testing possible.
//
// Two ways to reach it, and BOTH are opt-in:
//   - local development, always; or
//   - a deployment that explicitly sets NEXT_PUBLIC_ENABLE_TEST_CREDITS=1
//
// The second exists so a hosted preview can be tested on a phone
// before real payments are switched on. It defaults to OFF, so
// forgetting to add it is safe and only deliberately adding it is
// risky — that's the right way round.
//
// THAT WAS NOT ENOUGH. The flag was set on the live site, and the
// route only ever checked "is someone signed in" — while signing in
// is one tap of a free Google account. So anyone who guessed this
// URL could mint 500 credits at a time, and an audit found 1,404
// credits minted across eight accounts against zero real payments,
// one of them an account nobody recognised.
//
// A flag says WHETHER the door exists. It cannot say WHO may walk
// through it. So the route now also checks that the caller is the
// admin — the same email that gates /admin7731 — which makes the
// blast radius one account instead of the internet, even if the flag
// is left on by accident forever.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { refundCredits, getUser, publicUser } from "@/lib/users";
import { ADMIN_EMAIL } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GRANT = 500;

export function testCreditsEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_TEST_CREDITS === "1"
  );
}

export async function POST(req) {
  if (!testCreditsEnabled()) {
    // 404, not 403: on the live site this should be indistinguishable
    // from a route that was never deployed.
    return new NextResponse("Not found", { status: 404 });
  }

  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let amount = 45;
  try {
    const body = await req.json();
    amount = Math.min(Math.max(parseInt(body.amount, 10) || 45, 1), MAX_GRANT);
  } catch {}

  // The account's own email, read from the record rather than taken
  // from the request — a caller cannot claim to be the admin.
  //
  // 404 rather than 403, for the same reason as above: someone
  // probing should not learn that the route exists and they are
  // merely the wrong person.
  const me = await getUser(session.accountId);
  if (!me || me.email !== ADMIN_EMAIL) {
    console.warn(`[dev/grant] refused: ${me?.email || session.accountId}`);
    return new NextResponse("Not found", { status: 404 });
  }

  await refundCredits(session.accountId, amount);
  const user = await getUser(session.accountId);
  console.log(`[dev/grant] +${amount} credits to ${session.accountId}`);
  return NextResponse.json({ ok: true, granted: amount, user: publicUser(user) });
}
