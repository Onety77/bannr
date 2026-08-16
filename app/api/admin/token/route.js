// GET / POST /api/admin/token — the token gate's settings.
//
// Every number that decides who gets free generations, how many, and
// what it can cost us lives in one Firestore document and is edited
// here. Nothing about the gate is a code constant, deliberately: the
// week this launches is the week the numbers will be wrong, and
// "redeploy to change the daily allowance" is not a plan.
//
// Admin-verified on every call via requireAdmin — a signed Firebase ID
// token checked server-side, not the client's own opinion of who it
// is. Same guard as every other /api/admin route.
//
// GET also returns today's live usage against the ceiling, because the
// one thing you actually want to know when you open this panel is what
// the promotion is currently costing.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { getGate, saveGate, cleanGate, DEFAULT_GATE } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Cost per run at three options: $0.10 an image, times three, plus
// $0.008 for the art-director text call that steers them.
//
// ══ THIS WAS 0.081 AND IT WAS WRONG BY FOUR TIMES ══
//
// It carried $0.024 an image, measured against an older model and then
// left alone. Every allowance field in the panel shows a projected
// monthly cost derived from this, so a Founder rung at four runs a day
// was being reported at $9.72 a month when the real figure is nearer
// $37 — and the rungs were being chosen against the wrong number.
//
// A cost constant that nobody re-measures is worse than no constant at
// all: it looks like evidence. If the model or the price changes
// again, this is the line to change, and the free-run ceiling in
// lib/tokenGate.js quotes it.
export const COST_PER_RUN = 0.308;

// Live price, best effort, ADMIN-ONLY and never in the generation
// path. It exists so the threshold can be typed in dollars and STORED
// in tokens, which is the important half: a dollar threshold would put
// a price feed on the critical path, so a dead API or a 30-second wick
// would decide whether someone can generate. Tokens are stable, the
// dollar figure is guidance, and this is the calculator between them.
async function priceOf(mint) {
  if (!mint) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: ctl.signal });
    const d = await r.json();
    // Deepest liquidity wins — a fresh token collects thin junk pairs,
    // and the first one in the array is not necessarily the real market.
    const best = (d?.pairs || [])
      .filter((p) => Number(p?.priceUsd) > 0)
      .sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0];
    return best ? { usd: Number(best.priceUsd), pair: best.url || "", liquidity: best?.liquidity?.usd || 0 } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function usageToday(db) {
  if (!db) return { runs: 0 };
  try {
    const snap = await db.collection("counters").doc(`gate-${todayKey()}`).get();
    return { runs: snap.exists ? snap.data().runs || 0 : 0 };
  } catch {
    return { runs: 0 };
  }
}

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  const gate = await getGate({ fresh: true });
  const [usage, price] = await Promise.all([usageToday(db), priceOf(gate.mint)]);

  return NextResponse.json({
    gate,
    defaults: DEFAULT_GATE,
    price,
    usage: { ...usage, spend: +(usage.runs * COST_PER_RUN).toFixed(2), costPerRun: COST_PER_RUN },
    day: todayKey(),
  });
}

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  // Merged over what is already stored, so the panel can send one
  // field without silently resetting the rest to defaults.
  const current = await getGate({ fresh: true });
  const next = cleanGate({ ...current, ...body });

  // cleanGate refuses to leave `enabled` true without a mint and a
  // ladder that grants something. Saying so beats saving a config that
  // reads as on and behaves as off.
  if (body?.enabled && !next.enabled) {
    return NextResponse.json(
      { error: "Can't switch the tiers on yet — they need a valid contract address, a holding above 0 on the first tier, and at least one tier granting runs or a discount." },
      { status: 400 }
    );
  }

  const saved = await saveGate(next, admin.email || "");
  return NextResponse.json({ ok: true, gate: saved, usage: await usageToday(db) });
}
