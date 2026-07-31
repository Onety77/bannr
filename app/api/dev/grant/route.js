// POST /api/dev/grant — DEVELOPMENT ONLY.
//
// Credits can no longer be minted by the client, which is the whole
// point of moving them server-side. That leaves no way to top up
// until the treasury wallet and Helius webhook are configured, so
// this exists purely to keep local testing possible.
//
// It refuses to run outside development. If this ever responds in
// production, credits are free and the product has no revenue — so
// the guard is a hard 404 rather than a soft warning, and it reads
// NODE_ENV, which Next sets to "production" on every real build.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { refundCredits, getUser, publicUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GRANT = 500;

export async function POST(req) {
  if (process.env.NODE_ENV === "production") {
    // 404, not 403: in production this route should be indistinguishable
    // from one that was never deployed.
    return new NextResponse("Not found", { status: 404 });
  }

  const session = requireUser(req);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let amount = 45;
  try {
    const body = await req.json();
    amount = Math.min(Math.max(parseInt(body.amount, 10) || 45, 1), MAX_GRANT);
  } catch {}

  await refundCredits(session.wallet, amount);
  const user = await getUser(session.wallet);
  console.log(`[dev/grant] +${amount} credits to ${session.wallet}`);
  return NextResponse.json({ ok: true, granted: amount, user: publicUser(user) });
}
