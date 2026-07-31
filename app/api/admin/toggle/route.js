// POST /api/admin/toggle — flip one moderation flag on one
// generation. Body: { id, field: "featuredWall"|"featuredHero"|"hidden", value: boolean }
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set(["featuredWall", "featuredHero", "hidden"]);

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Firestore not configured." }, { status: 501 });

  const { id, field, value } = await req.json();
  if (!id || !ALLOWED_FIELDS.has(field) || typeof value !== "boolean") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  await db.collection("generations").doc(id).update({ [field]: value });
  return NextResponse.json({ ok: true });
}
