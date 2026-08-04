// GET  /api/admin/feed?filter=all|reported|hidden
// POST /api/admin/feed   { id, hidden }
//
// Moderation shipped in the same commit as publishing, deliberately.
// A public feed with no way to take something down is not a feature
// with moderation pending — it is an open posting surface attached to
// a brand, and the first thing that goes wrong is unfixable until
// someone writes this file.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { listForAdmin, setHidden, AUTOHIDE_REPORTS } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const filter = new URL(req.url).searchParams.get("filter") || "all";
  const items = await listForAdmin({ filter });
  return NextResponse.json({
    items,
    autohide: AUTOHIDE_REPORTS,
    counts: {
      all: items.length,
      reported: items.filter((p) => (p.reports || 0) > 0).length,
      hidden: items.filter((p) => p.hidden).length,
    },
  });
}

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const id = String(body?.id || "").slice(0, 64);
  if (!id || typeof body?.hidden !== "boolean") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  await setHidden(id, body.hidden);
  return NextResponse.json({ ok: true });
}
