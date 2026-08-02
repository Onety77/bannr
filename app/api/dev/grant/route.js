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
// risky — that's the right way round. If this ever answers on the
// live site, credits are free and there is no revenue.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { refundCredits, getUser, publicUser } from "@/lib/users";

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

  await refundCredits(session.accountId, amount);
  const user = await getUser(session.accountId);
  console.log(`[dev/grant] +${amount} credits to ${session.accountId}`);
  return NextResponse.json({ ok: true, granted: amount, user: publicUser(user) });
}
