// GET /api/references — did the reference sets survive deployment?
//
// Style references live outside public/, so Next has no reason to
// guess a serverless function needs them; next.config.mjs forces them
// in with outputFileTracingIncludes. If that ever stops working the
// failure is SILENT — the folder simply reads as empty and the style
// generates exactly as it did before, with no error anywhere. That is
// the worst shape a bug can have, because it looks perfect locally.
//
// So: one endpoint that answers "are they actually there, in the
// environment that matters". Counts only — no filenames, no images,
// nothing about what any of them contain.
import { NextResponse } from "next/server";
import { referenceCount } from "@/lib/references";
import { TEMPLATES } from "@/lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const using = TEMPLATES.filter((t) => t.useReferences);
  const counts = {};
  for (const t of using) counts[t.id] = await referenceCount(t.id);

  const missing = Object.entries(counts).filter(([, n]) => n === 0).map(([id]) => id);

  return NextResponse.json({
    ok: missing.length === 0,
    counts,
    ...(missing.length
      ? { warning: `No reference images found for: ${missing.join(", ")}. These styles are generating without them.` }
      : {}),
  });
}
