// ============================================================
// /api/admin/tier — give somebody a tier without them holding one.
//
// Competition winners, partners, a project being courted, someone
// owed a favour. Until this existed the only route to a tier was
// holding tokens, so the answer to "can you just give them access"
// was no.
//
// Built like /api/admin/grant next door, and for the same reasons:
// admin-verified server-side on every call, aimed at a NAMED
// recipient rather than the caller, and written down with a reason —
// because an account with capabilities nobody can explain is exactly
// how the last unaudited grant tool went unnoticed for weeks.
//
// A grant does not touch credits, and credits do not touch tiers. The
// two are separate ladders and mixing them here would make both
// harder to reason about.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getUser, setTierGrant, clearTierGrant } from "@/lib/users";
import { accountForHandle } from "@/lib/handles";
import { TIER_IDS, activeGrant } from "@/lib/tiers";
import { getGate } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A handle is what an admin actually has — it is what the feed and
// the leaderboard show. An account id is accepted too, for anyone who
// has not picked one.
async function resolve(to) {
  const handle = String(to || "").trim().replace(/^@/, "").toLowerCase();
  if (!handle) return null;
  const accountId = (await accountForHandle(handle).catch(() => null)) || String(to).trim();
  const user = await getUser(accountId);
  return user ? { accountId, user, handle } : null;
}

export async function GET(req) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getAdminDb();
  const gate = await getGate();
  if (!db) return NextResponse.json({ grants: [], tiers: gate.tiers });

  // Read from the LEDGER rather than by scanning every account for a
  // tierGrant field — that would be a full collection read on a page
  // load, and it would grow with signups rather than with grants.
  //
  // The ledger is the record of what was done; the account is the
  // state. `live` reconciles them, so a grant that was later revoked
  // or overwritten shows as history rather than as a promise.
  let rows = [];
  try {
    const snap = await db.collection("tierGrants").orderBy("ts", "desc").limit(50).get();
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {}

  const live = await Promise.all(
    rows.map(async (r) => {
      const u = await getUser(r.accountId).catch(() => null);
      const g = activeGrant(u);
      return { ...r, live: Boolean(g && g.at === r.at) };
    })
  );

  return NextResponse.json({ grants: live, tiers: gate.tiers });
}

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}

  if (!TIER_IDS.includes(body.tier)) {
    return NextResponse.json({ error: "Pick a tier." }, { status: 400 });
  }

  const found = await resolve(body.to);
  if (!found) return NextResponse.json({ error: `No account for "${body.to}".` }, { status: 404 });

  const grant = await setTierGrant(found.accountId, body, admin.email || "admin");
  if (!grant) return NextResponse.json({ error: "Couldn't grant that." }, { status: 400 });

  const db = getAdminDb();
  if (db) {
    await db.collection("tierGrants").add({
      accountId: found.accountId,
      handle: found.user.handle || found.handle || null,
      tier: grant.tier,
      days: grant.days,
      until: grant.until,
      at: grant.at,
      reason: grant.reason,
      by: grant.by,
      ts: Date.now(),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, grant, accountId: found.accountId });
}

export async function DELETE(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const to = new URL(req.url).searchParams.get("to");
  const found = await resolve(to);
  if (!found) return NextResponse.json({ error: `No account for "${to}".` }, { status: 404 });

  await clearTierGrant(found.accountId);

  // Revocations are written down too. A grant that vanishes with no
  // record is the same problem as a grant nobody can explain.
  const db = getAdminDb();
  if (db) {
    await db.collection("tierGrants").add({
      accountId: found.accountId,
      handle: found.user.handle || found.handle || null,
      tier: "", days: 0, until: 0, at: Date.now(),
      reason: "revoked",
      by: admin.email || "admin",
      ts: Date.now(),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
