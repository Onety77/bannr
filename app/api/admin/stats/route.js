// GET /api/admin/stats — the funnel, last 14 days.
//
// Admin-only, and not because the numbers are sensitive — they are
// three integers with nothing personal behind them. It is that a
// public endpoint returning traffic figures is a gift to anyone
// deciding whether this place is worth bothering with.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { recent } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = await recent(14);

  // Totals over the window, so a quiet Tuesday does not read as a
  // collapse in conversion. A rate computed from one day of small
  // numbers swings wildly and means nothing.
  const sum = days.reduce(
    (a, d) => ({
      landed: a.landed + d.landed,
      started: a.started + d.started,
      generated: a.generated + d.generated,
    }),
    { landed: 0, started: 0, generated: 0 }
  );

  return NextResponse.json({ days, sum, today: days[days.length - 1] || null });
}
