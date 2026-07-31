// GET /api/admin/generations — recent generations for moderation.
// Admin-only: verified via requireAdmin on every call, not just at
// page load, so a stolen/expired client session can't linger.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 60;

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  const snap = await db.collection("generations").orderBy("ts", "desc").limit(LIST_LIMIT).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ items });
}
