// ============================================================
// POST /api/generate — v4 pipeline
// One engine: OpenAI gpt-image-2. No key = demo backgrounds.
// Variants generate IN PARALLEL.
// Every real-engine variant renders art, typography and logo
// identity as ONE native AI image — no server-side text/logo
// compositing. Compositing only exists for zero-config demo mode.
//
// Styles flagged `concepts` get an ART-DIRECTOR PASS first: one cheap
// text call that writes a distinct concept per variant, which the
// image call then executes. This file used to state "no separate
// reasoning pass" as a principle. That principle was wrong, and the
// proof was months of identical mark-left/name-right output from an
// image model being asked to ideate — which is not a thing image
// models do.
//
// NOTHING IS CROPPED. gpt-image-2 renders natively at 1536x512 —
// exactly 3:1 — so getting to 1500x500 is a plain 2.3% downscale.
// The old dual-engine setup (Gemini as a second engine) is gone:
// neither its 21:9 ceiling nor its art quality was good enough for
// these banners, and every 21:9 render had to be cropped to fit.
// Successful generations feed the homepage spotlight.
// ============================================================

import sharp from "sharp";
import { NextResponse } from "next/server";
import {
  getTemplate, autoTemplate, buildPrompt, distributeStyles,
  VARIANT_SEASONING, REASSURANCE, ASSIST_NUDGE, AUTO_ID, AUTO_NAME,
  BANNER_W, BANNER_H,
} from "@/lib/templates";
import { demoBackgroundSVG } from "@/lib/engine/backgrounds";
import { composeBanner } from "@/lib/engine/compose";
import { aiEnabled, generateBackground, generateConcepts, diagnoseContent } from "@/lib/openai";
import { publicError, isPolicyError } from "@/lib/errors";
import { recordRefusal } from "@/lib/refusals";
import { bump } from "@/lib/stats";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  refundGeneration, consumeGeneration, refundCredits, partialRefundCredits,
  spendCredits, getUser, publicUser, getSettings, GENERATION_COST, REROLL_COST,
  runCost, FREE_RUN_MAX_OPTIONS,
} from "@/lib/users";
import { resolveEntitlements } from "@/lib/entitlements";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { styleReferences } from "@/lib/references";
import { buildDirection, spreadSettings, sharedSettings, optionDirection } from "@/lib/advanced";

export const runtime = "nodejs";
export const maxDuration = 120;

// Per file. Same reason as the PFP route: the platform refuses a
// request body over ~4.5MB with a 413 before this function runs, so
// 8MB was a number we could advertise and never honour — accepted by
// the copy, rejected by the host, with no log line and nothing on
// screen to explain it. The client shrinks first; see lib/downscale.js.
const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Supporting images. Raised from 3 — gpt-image-2 takes the whole set
// in one edits call, so the only real cost is payload size, and each
// is already downscaled to 1024 and re-encoded as JPEG before it is
// sent. Someone with five pieces of art for their character should
// not have to pick which two to drop.
const MAX_REFS = 5;


// Shared across instances and across deploys — see lib/rateLimit.
// The map that used to live here counted per serverless instance,
// so the real ceiling was this number times however many were
// running, and every deploy reset it to zero.
const RATE = { limit: 6, windowMs: 60_000 };

export async function POST(req) {
  // Hoisted so the catch below can record exactly which brief was
  // refused, and run the free text-vs-image diagnosis on it — that's
  // the entire value of the refusal log.
  let brief = null;
  let templateId = "";
  let logoBase64 = null;

  // Set once credits have actually been taken, so the catch below
  // knows whether there is anything to give back.
  let charged = null;

  try {
    // Identity first: everything below spends real money, so nothing
    // runs until we know whose account is paying. The wallet comes
    // from the signed session cookie, never from the request body —
    // a client-supplied address would let anyone spend anyone's
    // credits just by typing their address.
    const session = requireUser(req);
    if (!session) {
      return NextResponse.json(
        { error: "Sign in to generate banners.", code: "signin_required" },
        { status: 401 }
      );
    }

    // Per account, and shared across instances — see lib/rateLimit.
    // The comment that stood here said the in-memory map "never worked
    // on serverless anyway", which was true and was left as an
    // observation rather than fixed. It is fixed now.
    const rl = await rateLimit("generate", session.accountId, RATE);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Slow down — too many generations in one minute." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    // ══ HOW MANY FREE RUNS THIS ACCOUNT HAS ══
    //
    // Nothing else. It used to decide which parts of the brief were
    // allowed too, and that was wrong — see the note further down.
    //
    // The RPC behind this fires at most once per account per day — see
    // gateStateOf — and never at all when the gate is off.
    const { gate, ent } = await resolveEntitlements(session.accountId);

    const form = await req.formData();
    brief = {
      name: String(form.get("name") || "").slice(0, 60),
      ticker: String(form.get("ticker") || "").slice(0, 16),
      tagline: String(form.get("tagline") || "").slice(0, 80),
      vibe: String(form.get("vibe") || "").slice(0, 400),
      // Free-text creative direction. Capped well below About: this
      // is a steer on top of a chosen style, not a competing brief,
      // and a wall of text here would drown the style it is meant to
      // be adjusting.
      direction: String(form.get("direction") || "").slice(0, 240),
    };
    if (!brief.name.trim()) return NextResponse.json({ error: "A coin name is required." }, { status: 400 });
    if (brief.ticker && !brief.ticker.startsWith("$")) brief.ticker = "$" + brief.ticker;

    // ══ NOTHING IN THE BRIEF IS GATED ANY MORE ══
    //
    // This block stripped the direction note, forced a locked account
    // back to Default and emptied the advanced settings, all according
    // to a tier. It meant somebody who had PAID ranked below somebody
    // holding $20 of a token — the person handing us cash could not
    // pick a style. Features are priced, never gated; see lib/tiers.js.
    //
    // What a tier still decides is how many runs are free and what a
    // pack costs, both of which are money and neither of which is a
    // lock on the product.

    // One or more styles. `templateId` is still accepted so old links
    // and /create?style= keep working; `styles` is the multi-select
    // form. Unknown ids are dropped rather than failing the run — a
    // stale bookmark shouldn't be a hard error.
    const requested = [
      ...String(form.get("styles") || "").split(",").map((s) => s.trim()).filter(Boolean),
      ...(form.get("templateId") ? [String(form.get("templateId"))] : []),
    ];
    const styleIds = [...new Set(requested)].filter((id) => id === AUTO_ID || getTemplate(id));
    if (styleIds.length === 0) styleIds.push(AUTO_ID);
    templateId = styleIds.join(",");

    // A REROLL replaces ONE option the user already has, in the same
    // style. Read before the clamp below, which floors a run at two
    // options — a floor that is right for a run (a single option is
    // not a choice) and wrong here, and which would otherwise have
    // quietly turned every 1-credit reroll into two images.
    const isReroll = String(form.get("reroll") || "") === "1";
    const avoidConcept = isReroll ? String(form.get("avoidConcept") || "").slice(0, 900) : "";

    let variantCount = isReroll ? 1 : Math.min(
      Math.max(parseInt(form.get("variants") || "4", 10) || 4, 2),
      // Never fewer options than styles — every chosen style must
      // appear at least once, which is the whole promise of the
      // multi-select. The UI enforces this too; this is the backstop.
      Math.max(4, styleIds.length)
    );
    if (isReroll && styleIds.length !== 1) {
      return NextResponse.json(
        { error: "A reroll replaces one option, so it needs exactly one style." },
        { status: 400 }
      );
    }
    const perVariantStyle = distributeStyles(styleIds, Math.max(variantCount, styleIds.length));

    // Per-style advanced overrides, keyed by style id. Malformed JSON
    // is ignored rather than failing the run — these are refinements,
    // and losing them is far better than losing the generation.
    let advanced = {};
    try {
      const parsed = JSON.parse(String(form.get("advanced") || "{}"));
      if (parsed && typeof parsed === "object") advanced = parsed;
    } catch {}

    // The account-level "never include" rule, read from the ACCOUNT
    // rather than the request — a saved rule the client could omit
    // wouldn't be much of a rule. Merged into every style rather than
    // replacing a per-run Avoid, so the two combine instead of one
    // silently winning.
    const accountAvoid = (await getSettings(session.accountId)).avoid?.trim();
    if (accountAvoid) {
      for (const id of styleIds) {
        const s = advanced[id] || {};
        const perRun = String(s.avoid || "").trim();
        advanced[id] = {
          ...s,
          avoid: perRun ? `${accountAvoid}; ${perRun}` : accountAvoid,
        };
      }
    }

    // Required, not optional: every banner is built around an actual
    // identity, whether the token has launched yet or not — there's
    // no "no image" case bannr supports.
    const logoFile = form.get("logo");
    if (!logoFile || typeof logoFile.arrayBuffer !== "function" || logoFile.size === 0) {
      return NextResponse.json({ error: "A logo or pfp image is required — every banner is built around it." }, { status: 400 });
    }
    if (logoFile.size > MAX_LOGO_BYTES)
      return NextResponse.json({ error: "That logo is too large — try a smaller one." }, { status: 400 });
    if (!ALLOWED_TYPES.includes(logoFile.type))
      return NextResponse.json({ error: "Logo must be PNG, JPG or WEBP." }, { status: 400 });
    const raw = Buffer.from(await logoFile.arrayBuffer());
    const logoPng = await sharp(raw).rotate().png().toBuffer();

    // supporting reference images (optional, up to 3) — passed to
    // gpt-image-2 alongside the logo as style/character guidance.
    // Downscaled to keep request payloads sane.
    const refs = [];
    for (const f of form.getAll("refs").slice(0, MAX_REFS)) {
      if (!f || typeof f.arrayBuffer !== "function" || f.size === 0) continue;
      if (f.size > MAX_LOGO_BYTES) continue;
      if (!ALLOWED_TYPES.includes(f.type)) continue;
      try {
        const jpeg = await sharp(Buffer.from(await f.arrayBuffer()))
          .rotate()
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 82 })
          .toBuffer();
        refs.push(jpeg.toString("base64"));
      } catch {}
    }

    // The logo rides along as image input — it's the project's real
    // identity, not just a shape to badge onto a corner (see the
    // doctrine in lib/templates.js). No withoutEnlargement here:
    // OpenAI's images/edits rejects very small input images outright,
    // and plenty of real logo uploads are small (old favicons,
    // simple 128x128 marks) — always upscale to a safe floor. This
    // is required now, so a conversion failure is a real generation
    // failure (caught by the route's own try/catch below), not a
    // silent "proceed without an image" — that's no longer a valid
    // state for the engine to render from.
    const logoJpeg = await sharp(logoPng)
      .resize(1024, 1024, { fit: "inside" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    logoBase64 = logoJpeg.toString("base64");

    // User-chosen escalation after a refusal. "" = normal run.
    // "nudge"     — keep their image, ask for illustration over photo.
    // "reimagine" — stop preserving the image, restyle from scratch.
    // Never inferred; only ever set by an explicit button click.
    const assist = String(form.get("assist") || "");
    const reimagine = assist === "reimagine";


    // -------- engine --------
    // gpt-image-2 or nothing. No key = demo mode.
    const demoMode = !aiEnabled();

    // -------- charge --------
    // Taken here, after validation but before any paid API call, in a
    // Firestore transaction so two parallel runs can't both spend the
    // last credits. Everything below is wrapped by the catch, which
    // refunds on any failure.
    //
    // Two ways to pay now, tried in this order: the free daily bucket
    // a $BANNR holder gets, then credits. The order is not a
    // preference, it is a correctness requirement — taking credits
    // from someone who had a free run available is a straightforward
    // overcharge, and they would have no way to notice.
    if (!demoMode && isReroll) {
      // Straight to credits, deliberately bypassing consumeGeneration
      // rather than passing it a flag. The holder bucket cannot fund
      // this, and making that structural means it cannot be switched
      // on by mistake later.
      const remaining = await spendCredits(session.accountId, REROLL_COST);
      if (remaining === null) {
        return NextResponse.json(
          {
            error: `Not enough credits — another option costs ${REROLL_COST}. Top up on the credits page.`,
            code: "insufficient_credits",
          },
          { status: 402 }
        );
      }
      charged = { accountId: session.accountId, amount: REROLL_COST, paidWith: "credits" };
    } else if (!demoMode) {
      // The ladder was resolved at the top of the request, because the
      // same answer decides which fields are allowed. All that is left
      // here is spending it. The free tier is the floor of
      // entitlementsOf(), so a signed-in non-holder arrives with one
      // run to spend and a gate that is entirely switched off changes
      // nothing about that.
      // Priced by what the run actually makes. Two options cost two
      // credits; three and four cost three. See runCost.
      const cost = runCost(variantCount);
      const paid = await consumeGeneration(session.accountId, {
        allowance: ent.dailyRuns,
        globalCap: gate.dailyGlobalRuns,
        cost,
      });
      if (!paid?.ok) {
        return NextResponse.json(
          {
            error: paid?.capped
              // Says the promotion, not "holder runs" — the free daily
              // run comes out of the same ceiling now, so someone who
              // has never held a token can hit this and being told the
              // holder allowance ran out would be nonsense to them.
              ? "Today's free runs are all used up across the site. Credits still work, or try again tomorrow."
              : `Not enough credits — ${variantCount} options cost ${cost}. Top up on the credits page.`,
            code: "insufficient_credits",
          },
          { status: 402 }
        );
      }
      // paidWith decides how a failure is undone. Refunding credits for
      // a run that was free would mint them out of nothing.
      charged = { accountId: session.accountId, amount: cost, paidWith: paid.paidWith };

      // ══ A FREE RUN STOPS AT THREE ══
      //
      // Decided here rather than before charging, because until
      // consumeGeneration answers we do not know whether this run came
      // out of the daily allowance or out of credits — and only the
      // free one is capped. Someone paying gets what they asked for.
      //
      // Every free run is four images of real money against no
      // revenue, and at four a day the allowances were the single
      // largest cost in the product. Three still shows a spread worth
      // choosing between.
      //
      // Never below the number of styles chosen, though. "Every style
      // you picked appears at least once" is a promise the picker
      // makes on screen, and quietly dropping one to save an image
      // would be breaking it to save money.
      if (paid.paidWith === "holder") {
        variantCount = Math.min(variantCount, Math.max(FREE_RUN_MAX_OPTIONS, styleIds.length));
      }
    }

    // Each variant carries its own style now. Normal ("auto") sends no
    // style guidance at all, but demo mode and /api/convert still need
    // a concrete template to hang layout data off, so one is picked at
    // random purely for that — see autoTemplate(), which strips every
    // field that would otherwise instruct the model. This comment used
    // to claim the borrowed template "never reaches the AI prompt";
    // that stopped being true the moment styles gained structural
    // flags, and it went unnoticed because the symptom was randomness
    // in a mode whose whole job is to vary.
    //
    // The result is still labelled "Default" rather than the borrowed
    // id, which would mislabel the option and could wrongly pin a
    // future "re-run this style" to something never chosen.
    const jobs = Array.from({ length: variantCount }, (_, i) => {
      const styleId = perVariantStyle[i];
      const isAuto = styleId === AUTO_ID;
      const template = isAuto ? autoTemplate() : getTemplate(styleId);
      // This job's position among the options of ITS OWN style, and how
      // many that style got in total. Both were already being computed
      // inline for seasoning; naming them lets the multi-value controls
      // spread across exactly the same positions, so the shot a banner
      // gets and the creative lean it gets are indexed the same way.
      const nth = perVariantStyle.slice(0, i).filter((s) => s === styleId).length;
      const of = perVariantStyle.filter((s) => s === styleId).length;
      return {
        i,
        isAuto,
        template,
        nth,
        of,
        // Controls that took several answers are resolved to ONE here,
        // per option. Everything downstream — buildDirection, the
        // prompt, the concept pass — sees an ordinary settings object
        // and never learns that a multi control exists.
        settings: spreadSettings(styleId, advanced[styleId] || {}, nth, of),
        // Seasoning is indexed per style, not per variant, so two
        // options of the SAME style get different creative leans while
        // two different styles both start from the neutral prompt.
        seasoning: VARIANT_SEASONING[nth % VARIANT_SEASONING.length],
        engine: demoMode ? "demo" : "gpt-image",
        display: !demoMode && isAuto
          ? { id: AUTO_ID, name: AUTO_NAME }
          : { id: template.id, name: template.name },
      };
    });

    // -------- the art-director pass --------
    // One text call per concept-enabled style, BEFORE the image jobs:
    // it writes one concrete concept per variant of that style, and
    // requires them to be compositionally unlike each other. This is
    // where option diversity actually comes from — the image model
    // executes, it does not ideate. Failure yields an empty list and
    // the jobs run exactly as they always did.
    const conceptByJob = {};
    if (!demoMode) {
      // Keyed by the DIRECTOR, not the style. Default jobs have no
      // template flags at all (autoTemplate strips them) and would
      // otherwise be grouped under whichever template they borrowed for
      // layout data — which is exactly the leak that was just closed.
      const wanting = {};
      jobs.forEach((job) => {
        if (job.isAuto) (wanting[AUTO_ID] ||= []).push(job.i);
        else if (job.template?.concepts) (wanting[job.template.id] ||= []).push(job.i);
      });
      await Promise.all(
        Object.entries(wanting).map(async ([styleId, indices]) => {
          const isDefault = styleId === AUTO_ID;
          const tpl = isDefault ? null : getTemplate(styleId);
          const settings = sharedSettings(styleId, advanced[styleId] || {});
          const list = await generateConcepts({
            brief,
            // On a reroll the director is told what is already on
            // screen so it goes somewhere else, rather than writing a
            // polite variation of the thing being replaced.
            // Default has no house style to work inside — that is the
            // whole point of it — so it gets the brief and nothing else.
            styleBrief: isDefault
              ? "No house style. You are choosing the direction yourself, from the project alone."
              : tpl.mood,
            count: indices.length,
            constraints: [
              buildDirection(styleId, settings),
              avoidConcept
                ? `ALREADY MADE FOR THIS PROJECT — the client has this concept in front of them and asked for something else. Do not repeat it, and do not produce a near neighbour of it:\n\n${avoidConcept}`
                : "",
            ].filter(Boolean).join("\n\n"),
            // ONE ASSIGNMENT PER CONCEPT, in the order the concepts
            // come back. Only ever non-empty when a per-option control
            // was given more than one answer.
            //
            // The director has to know this. Left to write freely it
            // picks its own shots, and the image prompt then arrives
            // carrying a concept built on one camera and a setting
            // demanding another — a contradiction the renderer
            // resolves by ignoring whichever it feels like. So the
            // choice is made once, here, and both halves are told.
            perConcept: indices.map((jobIndex) =>
              optionDirection(styleId, jobs[jobIndex].settings, advanced[styleId] || {})
            ),
            // `concepts` is either true (the design director) or the
            // name of the one this style wants.
            director: isDefault ? "default" : (typeof tpl.concepts === "string" ? tpl.concepts : "design"),
            // Only the Default director asks to see it — see `vision`
            // in lib/openai.js. It is the one most often working from a
            // brief with no description at all.
            logo: logoBase64,
          });
          indices.forEach((jobIndex, k) => {
            if (list[k]) conceptByJob[jobIndex] = list[k];
          });
        })
      );
    }

    // -------- generate all variants in parallel --------
    // allSettled, not all: one variant failing must not discard the
    // variants that succeeded. There's no cross-engine fallback to
    // attempt anymore — a failure here is simply a failure, and the
    // outer catch classifies it (quota / policy / bad key) and
    // refunds. That's the honest tradeoff for dropping Gemini.
    const settled = await Promise.allSettled(
      jobs.map(async (job) => {
        const isDemo = job.engine === "demo";

        let finalPng, bgSource, usedEngine;
        if (isDemo) {
          // zero-config fallback: procedural art + server-composited
          // text/logo, since there's no AI in the loop to do either.
          const seed = (Date.now() & 0xffff) + job.i * 7919 + job.template.id.length * 131;
          const bgBuf = await sharp(Buffer.from(demoBackgroundSVG(job.template, seed))).png().toBuffer();
          finalPng = await composeBanner(bgBuf, logoPng, job.template, brief, true);
          bgSource = bgBuf;
          usedEngine = "demo";
        } else {
          // -------- refusal retry ladder --------
          // Rung 1: the brief as written. Rung 2 (only after a content
          // refusal): same brief plus the REASSURANCE block — most
          // refusals are the filter misreading meme-culture tone, and
          // stating the real intent clears them. The user never sees
          // rung 1 fail. In reimagine mode the reassurance rides along
          // from the start (the user already hit the wall once), so
          // there's no second rung to climb — and non-policy errors
          // never retry, because a billing failure won't be fixed by
          // a nicer prompt.
          // A variant with a written concept doesn't get seasoning on
          // top — "take this in a different direction" pointed at a
          // specific plan is noise at best and contradiction at worst.
          const concept = conceptByJob[job.i] || "";
          const basePrompt = buildPrompt(job.template, brief, concept ? "" : job.seasoning, {
            auto: job.isAuto, settings: job.settings, concept,
          });
          const extras = [];
          if (assist) extras.push(REASSURANCE);            // user already hit the wall
          if (assist === "nudge") extras.push(ASSIST_NUDGE);
          const prompt = [basePrompt, ...extras].join("\n\n");

          // A style that opts in gets a rotating slice of its own
          // reference set, keyed on the variant index — so the options
          // in one run are pulled toward different examples instead of
          // all converging on whichever came first. An empty folder
          // yields an empty array and the style behaves exactly as it
          // did before.
          const styleRefs = job.template?.useReferences
            ? await styleReferences(job.template.id, job.i)
            : [];

          let artBuf;
          try {
            artBuf = await generateBackground(prompt, {
              logo: logoBase64, refs, styleRefs, reimagine,
              restyle: job.template?.restyle || "",
              mark: Boolean(job.template?.graphic),
            });
          } catch (err) {
            // Only the untouched first run climbs a rung on its own —
            // an assisted run already carries the strongest wording
            // for its stage, so retrying it identically wastes ~40s
            // and a second API call to fail the same way.
            if (assist || !isPolicyError(err)) throw err;
            artBuf = await generateBackground(`${prompt}\n\n${REASSURANCE}`, {
              logo: logoBase64, refs, styleRefs,
              restyle: job.template?.restyle || "",
              mark: Boolean(job.template?.graphic),
            });
          }
          usedEngine = "gpt-image";
          // gpt-image-2 renders 1536x512 — already exactly 3:1 — so
          // this is a pure 2.3% downscale to 1500x500 with nothing
          // cut off. "cover" and "fill" are identical at a matching
          // aspect ratio; cover is kept so that if the engine ever
          // returned an off-spec size we'd lose a sliver rather than
          // visibly stretch the art.
          finalPng = await sharp(artBuf)
            .resize(BANNER_W, BANNER_H, { fit: "cover", position: "center" })
            .png()
            .toBuffer();
          bgSource = finalPng;
        }

        // "bg" is what /api/convert re-frames for X Communities: the
        // clean pre-text background in demo mode (recomposited at the
        // new width), or the finished art itself for AI variants
        // (there's no separate text layer to redo).
        const bgJpeg = await sharp(bgSource).jpeg({ quality: 80 }).toBuffer();

        // Real emitted size — the lightbox reports it, and it's the
        // cheapest proof that nothing in the pipeline reshaped the art.
        const { width, height } = await sharp(finalPng).metadata();

        return {
          i: job.i,
          dataUrl: `data:image/png;base64,${finalPng.toString("base64")}`,
          bg: `data:image/jpeg;base64,${bgJpeg.toString("base64")}`,
          textMode: isDemo ? "composited" : "ai",
          engine: usedEngine,
          w: width,
          h: height,
          templateId: job.display.id,
          templateName: job.display.name,
          // THE CONCEPT TRAVELS WITH THE BANNER NOW.
          //
          // The art director already wrote this and the image call
          // already executed it; until now it was discarded the
          // moment the prompt was assembled. Sending it costs
          // nothing that has not already been spent, and it is the
          // only evidence a user has that something THOUGHT about
          // their project rather than pattern-matched it.
          //
          // Empty for styles with no director and for demo mode, so
          // the UI has to treat absence as normal, not as an error.
          concept: conceptByJob[job.i] || "",
          _finalPng: finalPng,
        };
      })
    );

    const results = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (results.length === 0) {
      // every variant failed — surface the real reason so the outer
      // catch classifies + refunds correctly.
      throw settled.find((s) => s.status === "rejected")?.reason || new Error("Generation failed.");
    }

    // PARTIAL RUNS ARE REFUNDED FOR WHAT DID NOT ARRIVE.
    //
    // This used to charge full price for a partial run, on the
    // grounds that every variant cost money whether it came back or
    // not. That is false for the most likely failure: a request
    // refused for rate limiting never renders an image and is never
    // billed, so the user was paying for options that cost nothing.
    //
    // Must run BEFORE the balance below is read, or the number sent
    // to the client is the pre-refund one and their balance appears
    // to be wrong until the next page load.
    const attempted = jobs.length;
    const missing = attempted - results.length;
    let refunded = 0;
    // Never on a reroll: it asks for exactly one option, so it either
    // arrives or the throw above sends it to the catch. Guarded
    // anyway because partialRefundCredits reasons in run prices.
    if (charged && missing > 0 && !isReroll) {
      // A free holder run is denominated in RUNS, not credits, so
      // there is no fraction of one to hand back. It stays spent
      // when the run produced anything at all, and is returned in
      // full by the catch above when it produced nothing. That is a
      // limitation of the unit rather than a policy — worth knowing
      // before someone reports it as an inconsistency.
      if (charged.paidWith !== "holder") {
        refunded = partialRefundCredits(missing, attempted);
        if (refunded > 0) {
          try {
            await refundCredits(charged.accountId, refunded);
          } catch (e) {
            // Loud, never silent: this is money owed to a real
            // person and the response is about to tell them it was
            // returned.
            console.error("[generate] PARTIAL REFUND FAILED", charged, refunded, e);
            refunded = 0;
          }
        }
      }
    }
    charged = null;

    // THE ONLY NUMBER IN THE FUNNEL THAT CANNOT BE FAKED. landed and
    // started are posted by a browser and are therefore a browser's
    // opinion; this one is counted here, after the images exist and
    // after the money moved, and there is no route a client can call
    // to reach it. Everything else is measured against it, so it is
    // the one that has to be true.
    //
    // Rerolls are excluded on purpose. A reroll is the same person
    // asking again, and counting it would make the conversion rate
    // climb every time somebody was UNhappy with what they got.
    if (!isReroll) bump("generated").catch(() => {});

    results.sort((a, b) => a.i - b.i);
    // NOTHING is recorded to the featuring pool here any more. This
    // line used to push results[0] — the first variant of every run,
    // chosen by nothing but position — so the admin board filled with
    // first-renders while the banners people actually downloaded were
    // never candidates at all. Downloading is the signal a banner
    // mattered; the pool is fed from the download click now (POST
    // /api/spotlight) and from admin uploads, nothing else.

    // The authoritative balance travels with the result, so the UI
    // never has to guess or keep its own running total.
    const after = demoMode ? null : await getUser(session.accountId);

    return NextResponse.json({
      ok: true,
      user: publicUser(after),
      // Silence here would be nearly as bad as the overcharge was:
      // fewer banners than asked for, and no way to tell whether
      // that was the product or a fault. Absent when nothing was
      // lost, so the happy path is untouched.
      shortfall: missing > 0 ? { asked: attempted, made: results.length, refunded } : null,
      demoMode,
      engine: demoMode ? "demo" : "gpt-image-2",
      styles: styleIds,
      template: { id: styleIds[0], name: jobs[0].display.name },
      brief,
      variants: results.map(({ _finalPng, i, ...v }) => v),
    });
  } catch (err) {
    // Full detail stays in the server log; the user gets sanitised
    // copy that never names the provider (see lib/errors.js).
    console.error("[generate]", err);

    // Refund before anything else can go wrong. The old client-side
    // refund could be lost to a closed tab or a dropped connection;
    // doing it here means a failed run always gives the credits back,
    // even if the user never sees the response.
    if (charged) {
      try {
        // Gives back whichever side actually paid — a free run returns
        // to today's holder bucket and to the global counter, not to
        // the credit balance.
        await refundGeneration(charged.accountId, charged.paidWith, charged.amount);
      } catch (e) {
        // A failed refund is a real loss to a real person — make it
        // loud in the log rather than swallowing it.
        console.error("[generate] REFUND FAILED", charged, e);
      }
    }

    let { error, status, reason } = publicError(err, "generate");
    let code = reason === "policy" ? "policy" : undefined;

    // Rung 3 of the ladder: the run was refused even with the
    // reassurance retry, so ask the (free) moderation endpoint WHICH
    // input tripped it — the words or the picture. An image verdict
    // unlocks the client's real offer: swap the image, or opt in to a
    // reimagined version of it. Text verdict gets pointed copy instead
    // of a vague apology. No verdict = keep the generic message; the
    // probe is advisory, never a second failure.
    let diagnosis = "unknown";
    let violations = "";
    if (reason === "policy" && brief) {
      // The image API often names its own reason — e.g.
      // "safety_violations=[sexual]" — which is more authoritative
      // than any probe. Captured for the admin log.
      violations = (err?.message?.match(/safety_violations=\[([^\]]*)\]/)?.[1] || "").trim();

      const probe = await diagnoseContent({
        // Direction is included deliberately: it is free text the
        // client wrote, so it is now one of the likelier things to
        // trip the filter. Leaving it out would misdiagnose a wording
        // problem as an image problem and send them to re-upload a
        // logo that was never at fault.
        text: [brief.name, brief.ticker, brief.tagline, brief.vibe, brief.direction].filter(Boolean).join("\n"),
        imageB64: logoBase64,
      });
      // Copy is stage-aware: the client shows a different set of
      // buttons depending on how far up the ladder we already are, so
      // the message must not promise an option that isn't on screen.
      const spent = "Your credits weren't spent.";
      if (probe?.flagged && probe.image) {
        diagnosis = "image";
        code = "image_flagged";
        error =
          "It looks like the uploaded image is what's tripping our content checks" +
          (probe.text ? " (the wording may be contributing too)" : "") +
          `. ${spent} Try one of the options below.`;
      } else if (probe?.flagged && probe.text) {
        diagnosis = "text";
        code = "text_flagged";
        error =
          `It looks like the wording — the name, tagline or description — is what's tripping our content checks. A small rewording usually gets it through. ${spent}`;
      } else if (assist === "nudge") {
        code = "policy_options";
        error = `That still didn't clear our content checks, even with the extra guidance. ${spent} There's one more thing we can try.`;
      } else if (assist === "reimagine") {
        code = "policy_options";
        error = `Even a fully reimagined version didn't clear our content checks — this subject is one the filter holds firm on. ${spent} A different image is the way forward.`;
      } else {
        // The probe saw nothing — which is common, because the image
        // model blocks whole classes the moderation model doesn't even
        // have categories for (real-person likenesses above all). We
        // can't attribute, but we can still hand the user every lever:
        // reimagining the image is exactly the move for the likeness
        // cases that land here. Without this branch, this entire class
        // got a dead-end apology and no buttons.
        code = "policy_options";
        error =
          `That didn't clear our content checks, and we can't tell exactly which part tripped it. It's often the image, though a small change to the name or description can be all it takes. ${spent} Try one of the options below.`;
      }

      // Server-log the verdict too: until Firestore is configured the
      // refusal log below no-ops, and this line is then the only
      // evidence of what the probe decided.
      console.log(`[generate] refusal diagnosis: ${diagnosis} violations=[${violations}] (name="${brief.name}")`);

      // A refused brief is invisible to us otherwise — the user just
      // sees friendly copy and may quietly give up. Record it so the
      // pattern is reviewable at /admin7731.
      await recordRefusal({ kind: "generate", reason: "policy", ...brief, templateId, diagnosis, violations, detail: err?.message });
    } else {
      // ══ AND EVERY OTHER FAILURE, WHICH USED TO GO NOWHERE ══
      //
      // This else did not exist. Quota, billing, a dead key, a timeout
      // and an outright crash all sent sanitised copy to the user and
      // wrote nothing down, so the admin panel read "no refusals" while
      // every run on the site was failing. That is the reverse of what
      // a monitoring surface is for: the class of failure that is OUR
      // fault was the one class guaranteed to be invisible.
      //
      // Tagged by reason so the word-ranking can still ignore it — a
      // hundred identical quota errors must not become "what refused
      // briefs have in common".
      await recordRefusal({ kind: "generate", reason, ...brief, templateId, detail: err?.message });
    }
    return NextResponse.json({ error, code, refunded: Boolean(charged) }, { status });
  }
}
