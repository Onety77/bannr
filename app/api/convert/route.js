// ============================================================
// POST /api/convert — X Community banner (1300 x 500)
// AI variants (textMode "ai") have no separate text/logo layer to
// redo — the incoming "bg" IS the finished art, so this is just an
// attention-aware crop to the new width. Demo-mode variants
// (textMode "composited") still carry a genuinely separate clean
// background, so those get recomposited at the new width exactly
// as before: art re-framed, logo + ticker/name/tagline re-laid-out,
// no stretching, no dumb crops through text.
// ============================================================

import sharp from "sharp";
import { NextResponse } from "next/server";
import { getTemplate, X_BANNER_W, BANNER_H } from "@/lib/templates";
import { composeBanner } from "@/lib/engine/compose";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const form = await req.formData();
    const templateId = String(form.get("templateId") || "");
    const textMode = String(form.get("textMode") || "composited");
    const bgDataUrl = String(form.get("bg") || "");

    const b64 = bgDataUrl.split(",")[1];
    if (!b64) return NextResponse.json({ error: "Missing background data." }, { status: 400 });
    const bgBuf = Buffer.from(b64, "base64");

    let png;
    if (textMode === "ai") {
      // already finished art — just re-frame to the new aspect ratio
      png = await sharp(bgBuf)
        .resize(X_BANNER_W, BANNER_H, { fit: "cover", position: "center" })
        .png()
        .toBuffer();
    } else {
      const brief = {
        name: String(form.get("name") || "").slice(0, 60),
        ticker: String(form.get("ticker") || "").slice(0, 16),
        tagline: String(form.get("tagline") || "").slice(0, 80),
      };
      const template = getTemplate(templateId);
      if (!template) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

      let logoPng = null;
      const logoFile = form.get("logo");
      if (logoFile && typeof logoFile.arrayBuffer === "function" && logoFile.size > 0) {
        const raw = Buffer.from(await logoFile.arrayBuffer());
        logoPng = await sharp(raw).rotate().png().toBuffer();
      }

      png = await composeBanner(bgBuf, logoPng, template, brief, true, { width: X_BANNER_W });
    }

    return NextResponse.json({
      ok: true,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      width: X_BANNER_W,
      height: BANNER_H,
    });
  } catch (err) {
    console.error("[convert]", err);
    return NextResponse.json({ error: "Conversion failed — try again." }, { status: 502 });
  }
}
