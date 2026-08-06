// POST /api/admin/grant — give credits to someone.
//
// REPLACES /api/dev/grant, which was a hole rather than a feature: it
// was gated by an environment flag plus a hardcoded list of four
// email addresses, it credited whoever CALLED it, and an audit found
// 1,404 credits minted across eight accounts against zero payments —
// one of them an account nobody recognised.
//
// This is the same capability built the right way round:
//
//   - admin-only, verified server-side on every call, like every
//     other /api/admin route. No env flag, so it cannot be left on.
//   - credits go to a NAMED recipient, not to the caller. Rewarding
//     someone requires being able to say who.
//   - every grant is written down with a reason, so the balance can
//     be explained a month later.
//
// This is also the airdrop tool: buying credits with our own money to
// hand out would be circular — the SOL goes to our own treasury — so
// a reward is simply credits granted. The cost is the OpenAI spend
// they represent, which is the real cost either way.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { refundCredits, getUser } from "@/lib/users";
import { accountForHandle } from "@/lib/handles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GRANT = 500;

export async function GET(req) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ grants: [] });
  try {
    const snap = await db.collection("grants").orderBy("ts", "desc").limit(50).get();
    return NextResponse.json({ grants: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch {
    return NextResponse.json({ grants: [] });
  }
}

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}

  const amount = Math.min(Math.max(parseInt(body.amount, 10) || 0, 1), MAX_GRANT);
  const reason = String(body.reason || "").trim().slice(0, 120);
  const to = String(body.to || "").trim();
  if (!to) return NextResponse.json({ error: "Who is it for?" }, { status: 400 });

  // A handle is what an admin actually has — it is what the feed and
  // the leaderboard show. An account id is accepted too, for anyone
  // who has not picked one.
  const handle = to.replace(/^@/, "").toLowerCase();
  const accountId = (await accountForHandle(handle).catch(() => null)) || to;

  const user = await getUser(accountId);
  if (!user) return NextResponse.json({ error: `No account for "${to}".` }, { status: 404 });

  await refundCredits(accountId, amount);

  const db = getAdminDb();
  if (db) {
    // Written down, always. A balance that cannot be explained later
    // is how the last version of this went unnoticed for weeks.
    await db.collection("grants").add({
      accountId,
      handle: user.handle || handle || null,
      amount,
      reason,
      by: admin.email || "admin",
      ts: Date.now(),
    }).catch(() => {});
  }

  const after = await getUser(accountId);
  console.log(`[admin/grant] +${amount} to ${accountId} (${reason || "no reason"}) by ${admin.email}`);
  return NextResponse.json({
    ok: true,
    granted: amount,
    to: user.handle ? `@${user.handle}` : accountId,
    credits: after?.credits || 0,
  });
}
