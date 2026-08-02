// ============================================================
// POST /api/edit — revise a finished banner.
// Takes the banner the user is looking at plus a plain-language
// instruction, and returns a new 1500x500 banner with that one
// change applied. Same engine and same endpoint as generation
// (gpt-image-2 via /v1/images/edits) — the only difference is what
// gets attached and what the prompt asks for.
//
// This is the difference between bannr being a generator and being
// a tool: without it, a banner that's 90% right dead-ends and the
// user finishes the job somewhere else.
//
// Credits and the free daily edit allowance are enforced SERVER-SIDE
// against the signed-in account (lib/users.js), inside a Firestore
// transaction. The client cannot decide what it can afford.
// ============================================================

import sharp from "sharp";
import { NextResponse } from "next/server";
import { BANNER_W, BANNER_H, buildEditPrompt, REASSURANCE } from "@/lib/templates";
import { aiEnabled, editImage } from "@/lib/openai";
import { publicError, isPolicyError } from "@/lib/errors";
import { recordRefusal } from "@/lib/refusals";
import { requireUser } from "@/lib/auth";
import { consumeEdit, refundCredits, getUser, publicUser, EDIT_COST } from "@/lib/users";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_INSTRUCTION = 400;
const MAX_REF_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 10;
}

export async function POST(req) {
  // Hoisted so the catch can record what was actually asked for.
  let instruction = "";
  // Only set when an edit was paid for with CREDITS. A free daily
  // edit has nothing to refund — giving a credit back for one would
  // hand out currency that was never spent.
  let charged = null;

  try {
    const session = requireUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "Sign in to edit banners.", code: "signin_required" },
        { status: 401 }
      );
    }
    if (rateLimited(session.accountId)) {
      return NextResponse.json({ error: "Slow down — too many edits in one minute." }, { status: 429 });
    }

    if (!aiEnabled()) {
      return NextResponse.json(
        { error: "Editing isn't available in preview mode." },
        { status: 400 }
      );
    }

    const form = await req.formData();

    instruction = String(form.get("instruction") || "").slice(0, MAX_INSTRUCTION).trim();
    if (!instruction) {
      return NextResponse.json({ error: "Describe the change you want." }, { status: 400 });
    }

    // The banner arrives as the data URL the page is already holding,
    // so no re-upload and no round trip to storage.
    const src = String(form.get("image") || "");
    const b64 = src.includes(",") ? src.split(",")[1] : src;
    if (!b64) {
      return NextResponse.json({ error: "No banner was supplied to edit." }, { status: 400 });
    }

    // Normalised to JPEG at the engine's native size: it's what the
    // model wants anyway, and it keeps the request payload small.
    //
    // Quality is high (96) on purpose. Every edit round-trips the
    // banner — 1500x500 PNG in, resampled up to 1536x512, JPEG'd,
    // re-rendered, then downscaled back to 1500x500 — and that loss
    // compounds across repeated edits. Measured: a purely structural
    // edit came back ~12% softer than its source. The re-encode is the
    // cheapest link to stop giving away, so don't lower this.
    const jpeg = await sharp(Buffer.from(b64, "base64"))
      .resize(1536, 512, { fit: "cover", position: "center" })
      .flatten({ background: "#000000" })
      .jpeg({ quality: 96, chromaSubsampling: "4:4:4" })
      .toBuffer();

    // Optional reference images (up to 3) showing what the user wants
    // added — same handling as the generate route's supporting images.
    const refs = [];
    for (const f of form.getAll("refs").slice(0, 3)) {
      if (!f || typeof f.arrayBuffer !== "function" || f.size === 0) continue;
      if (f.size > MAX_REF_BYTES) continue;
      if (!ALLOWED_TYPES.includes(f.type)) continue;
      try {
        const ref = await sharp(Buffer.from(await f.arrayBuffer()))
          .rotate()
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 82 })
          .toBuffer();
        refs.push(ref.toString("base64"));
      } catch {}
    }

    // Charged here — after validation, before the paid API call.
    // Free daily edits come out of the account allowance first; only
    // once those run out does this touch credits.
    const paid = await consumeEdit(session.accountId);
    if (!paid.ok) {
      return NextResponse.json(
        { error: "You're out of free edits and credits. Top up to keep editing.", code: "insufficient_credits" },
        { status: 402 }
      );
    }
    if (paid.paidWith === "credits") charged = { accountId: session.accountId, amount: EDIT_COST };

    // Same retry ladder as generation: one silent second attempt with
    // the reassurance block if the first was refused on content
    // grounds. Non-policy failures never retry.
    const editPrompt = buildEditPrompt(instruction, { refs: refs.length });
    const editInput = { image: jpeg.toString("base64"), refs };
    let artBuf;
    try {
      artBuf = await editImage(editPrompt, editInput);
    } catch (err) {
      if (!isPolicyError(err)) throw err;
      artBuf = await editImage(`${editPrompt}\n\n${REASSURANCE}`, editInput);
    }

    // Same 1536->1500 downscale as generation. Nothing is cropped.
    const finalPng = await sharp(artBuf)
      .resize(BANNER_W, BANNER_H, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
    const bgJpeg = await sharp(finalPng).jpeg({ quality: 80 }).toBuffer();

    charged = null; // succeeded — the charge stands

    return NextResponse.json({
      ok: true,
      user: publicUser(await getUser(session.accountId)),
      paidWith: paid.paidWith,
      dataUrl: `data:image/png;base64,${finalPng.toString("base64")}`,
      bg: `data:image/jpeg;base64,${bgJpeg.toString("base64")}`,
      w: BANNER_W,
      h: BANNER_H,
    });
  } catch (err) {
    // Full detail stays in the server log; the user gets sanitised
    // copy that never names the provider (see lib/errors.js).
    console.error("[edit]", err);
    // A failed edit costs nothing. Note this only refunds CREDITS —
    // a spent free daily edit is deliberately not restored, since
    // returning one would mint currency that never existed.
    if (charged) {
      try { await refundCredits(charged.accountId, charged.amount); }
      catch (e) { console.error("[edit] REFUND FAILED", charged, e); }
    }
    const { error, status, reason } = publicError(err, "edit");
    if (reason === "policy" && instruction) {
      await recordRefusal({ kind: "edit", instruction, detail: err?.message });
    }
    return NextResponse.json({ error }, { status });
  }
}
