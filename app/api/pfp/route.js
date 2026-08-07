// ============================================================
// POST /api/pfp — square avatars.
//
// A deliberately thinner sibling of /api/generate rather than a mode
// inside it. That route carries a demo engine, an art-director pass,
// a reference-image system, a refusal ladder with three rungs, an
// X-Communities re-frame and per-style advanced settings — and a PFP
// wants none of it. Folding this in would have meant threading a flag
// through every one of those, and every flag is a place for a banner
// change to silently alter avatars.
//
// ══ CREDITS ONLY, NOT THE HOLDER BUCKET ══
//
// The gate grants "free banners a day". A profile picture is not a
// banner, and spending that allowance on one would quietly take from
// the thing it was promised for. So this goes straight to credits, the
// way a reroll does — structurally, not behind a flag that could be
// switched on later by mistake.
//
// One credit per image, charged for the whole run up front and
// refunded in full if it fails.
// ============================================================
import sharp from "sharp";
import { NextResponse } from "next/server";
import { aiEnabled, generatePfp } from "@/lib/openai";
import { buildPfpPrompt, PFP_SIZE, PFP_MAX, PFP_COST, PFP_TEXT_MAX, PFP_WANTS_MAX, PFP_IMAGES_MAX, getPfpStyle, distributeStyles } from "@/lib/pfp";
import { publicError } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { spendCredits, refundCredits, getUser } from "@/lib/users";
import { bump } from "@/lib/stats";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const hits = new Map();
function rateLimited(id) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(id, arr);
  return arr.length > 8;
}

export async function POST(req) {
  let charged = null;

  try {
    const session = requireUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "Sign in to make a profile picture.", code: "signin_required" },
        { status: 401 }
      );
    }
    if (rateLimited(session.accountId)) {
      return NextResponse.json({ error: "Slow down — too many in one minute." }, { status: 429 });
    }
    if (!aiEnabled()) {
      return NextResponse.json({ error: "Image generation is not configured." }, { status: 503 });
    }

    const form = await req.formData();

    const text = String(form.get("text") || "").trim().slice(0, PFP_TEXT_MAX);
    // KEEPING THE BACKGROUND IS THE DEFAULT — the flag now asks for
    // the change rather than for the absence of one. Doing the least
    // to someone's picture is the safe default; replacing what is
    // behind their subject is a real edit and should be requested.
    const newBg = String(form.get("newBg") || "") === "1";
    const wants = String(form.get("wants") || "").trim().slice(0, PFP_WANTS_MAX);
    // Only ever a hex colour. Validated rather than trusted: this
    // string lands inside a prompt, and an unbounded field there is
    // somewhere to write instructions.
    const rawColor = String(form.get("color") || "").trim();
    const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "";

    const count = Math.min(Math.max(parseInt(form.get("count") || "2", 10) || 2, 1), PFP_MAX);

    // SEVERAL STYLES, ONE PER OPTION. Same helper and same contract as
    // the banner picker, so two styles across two options is one of
    // each rather than two of whichever was clicked first. Unknown ids
    // resolve to Default rather than failing the run — a stale draft
    // should still make a picture.
    const wanted = String(form.get("styles") || form.get("style") || "default")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => getPfpStyle(s).id);
    const styleIds = [...new Set(wanted)].slice(0, PFP_MAX);
    const perOption = distributeStyles(styleIds.length ? styleIds : ["default"], count);

    // SEVERAL VIEWS OF ONE SUBJECT. `image` stays accepted so a client
    // on the previous build still works.
    const files = [...form.getAll("images"), ...form.getAll("image")]
      .filter((f) => f && typeof f.arrayBuffer === "function" && f.size > 0)
      .slice(0, PFP_IMAGES_MAX);
    if (!files.length) {
      return NextResponse.json({ error: "Upload an image to make a profile picture from." }, { status: 400 });
    }
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ error: "Image too large (8MB max)." }, { status: 400 });
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        return NextResponse.json({ error: "Images must be PNG, JPG or WEBP." }, { status: 400 });
      }
    }

    // `fit: inside` and nothing else. The source is usually a PORTRAIT
    // phone screenshot, and squaring it here would hand the model a
    // stretched subject and a cropped one — the two things it is being
    // asked to fix. It has to see the real frame, interface and all,
    // to know what to throw away. No withoutEnlargement, because the
    // edits API rejects very small inputs outright.
    const srcs = await Promise.all(
      files.map(async (f) =>
        (
          await sharp(Buffer.from(await f.arrayBuffer()))
            .rotate()
            .resize(1024, 1024, { fit: "inside" })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 88 })
            .toBuffer()
        ).toString("base64")
      )
    );

    // -------- charge, before any paid call --------
    const total = count * PFP_COST;
    const remaining = await spendCredits(session.accountId, total);
    if (remaining === null) {
      return NextResponse.json(
        {
          error: `Not enough credits — ${count === 1 ? "one" : count} profile picture${count === 1 ? "" : "s"} costs ${total}. Top up on the credits page.`,
          code: "insufficient_credits",
        },
        { status: 402 }
      );
    }
    charged = { accountId: session.accountId, amount: total };

    // allSettled, so one failure does not discard the other image.
    const settled = await Promise.allSettled(
      perOption.map(async (id) => {
        const style = getPfpStyle(id);
        const prompt = buildPfpPrompt(style.id, { text, color, newBg, wants, images: srcs.length });
        const buf = await generatePfp(prompt, { images: srcs, size: PFP_SIZE });
        const png = await sharp(buf)
          .resize(PFP_SIZE, PFP_SIZE, { fit: "cover", position: "center" })
          .png()
          .toBuffer();
        const { width, height } = await sharp(png).metadata();
        return {
          dataUrl: `data:image/png;base64,${png.toString("base64")}`,
          w: width,
          h: height,
          // Labelled per image, because with two styles in one run
          // "which one is this" is no longer answerable from the form.
          style: style.id,
          styleName: style.name,
        };
      })
    );

    const images = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (!images.length) throw settled[0]?.reason || new Error("No images were produced.");

    // PARTIAL SUCCESS IS A PARTIAL CHARGE. One of two came back, so
    // one credit goes home — the alternative is charging for an image
    // that does not exist, which nobody would notice and everybody
    // would be right to mind.
    const missing = count - images.length;
    if (missing > 0) {
      await refundCredits(session.accountId, missing * PFP_COST).catch((e) =>
        console.error("[pfp] PARTIAL REFUND FAILED", session.accountId, missing, e)
      );
      charged = null;
    } else {
      charged = null;
    }

    bump("generated").catch(() => {});
    const user = await getUser(session.accountId).catch(() => null);

    return NextResponse.json({
      ok: true,
      images,
      // Stated rather than assumed by the client, so a partial run
      // shows the right number and the right balance.
      charged: images.length * PFP_COST,
      user: user ? { credits: user.credits } : undefined,
    });
  } catch (err) {
    console.error("[pfp]", err);
    if (charged) {
      try {
        await refundCredits(charged.accountId, charged.amount);
      } catch (e) {
        console.error("[pfp] REFUND FAILED", charged, e);
      }
    }
    const { error, status, reason } = publicError(err, "pfp");
    return NextResponse.json(
      {
        error,
        code: reason === "policy" ? "policy" : undefined,
      },
      { status }
    );
  }
}
