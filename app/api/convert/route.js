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
import { rateLimit, callerIp } from "@/lib/rateLimit";
import { getTemplate, X_BANNER_W, BANNER_H } from "@/lib/templates";
import { composeBanner } from "@/lib/engine/compose";

export const runtime = "nodejs";
export const maxDuration = 60;

// ══ EVERY BYTE HERE ARRIVES FROM OUTSIDE ══
//
// This route took a base64 background and a logo file of any size and
// handed both to sharp with nothing in between. Two ways that hurts,
// neither of them exotic:
//
//   size — nothing capped the upload, so the whole thing sat in memory
//   before anything looked at it;
//
//   pixels — a few hundred kilobytes of PNG can decode to gigabytes of
//   bitmap, and sharp will faithfully try. That is a decompression
//   bomb, and it costs the sender nothing to send.
//
// A finished 1536×512 banner is comfortably under 8MB as base64, and a
// logo is a logo. These are ceilings, not targets: anything legitimate
// is nowhere near them.
const MAX_BG_B64 = 12 * 1024 * 1024;
const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

// Image work costs CPU and memory whether or not anyone paid for it,
// and this route takes both without a session. The caps above bound
// one call; this bounds how many.
const RATE = { limit: 15, windowMs: 60_000 };

export async function POST(req) {
  try {
    const rl = await rateLimit("convert", callerIp(req), RATE);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Slow down — too many conversions in one minute." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const form = await req.formData();
    const templateId = String(form.get("templateId") || "");
    const textMode = String(form.get("textMode") || "composited");
    const bgDataUrl = String(form.get("bg") || "");

    if (bgDataUrl.length > MAX_BG_B64) {
      return NextResponse.json({ error: "That image is too large." }, { status: 413 });
    }
    const b64 = bgDataUrl.split(",")[1];
    if (!b64) return NextResponse.json({ error: "Missing background data." }, { status: 400 });
    const bgBuf = Buffer.from(b64, "base64");

    let png;
    if (textMode === "ai") {
      // already finished art — just re-frame to the new aspect ratio
      png = await sharp(bgBuf, { limitInputPixels: MAX_PIXELS })
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
        if (logoFile.size > MAX_LOGO_BYTES) {
          return NextResponse.json({ error: "That logo is too large." }, { status: 413 });
        }
        const raw = Buffer.from(await logoFile.arrayBuffer());
        logoPng = await sharp(raw, { limitInputPixels: MAX_PIXELS }).rotate().png().toBuffer();
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
