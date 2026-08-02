// ============================================================
// AI ART LAYER — OpenAI gpt-image-2 (the only engine).
// Returns a PNG buffer of the finished banner, or null if no key
// is configured (caller falls back to demo backgrounds).
//
// Renders natively at 1536x512 — EXACTLY 3:1, the banner's own
// aspect ratio. gpt-image-2 dropped the old fixed size list for a
// single rule (both dimensions divisible by 16), which is what
// makes a true 3:1 render possible at all; gpt-image-1 and
// gpt-image-1.5 still cap out at 1536x1024 (3:2) and had to be
// centre-cropped, which is what used to guillotine text and
// subjects. Nothing is cropped now — route.js only downscales
// 1536->1500 (a 2.3% resize).
//
// Always uses /v1/images/edits (images + prompt in, new image out)
// — the same image-conditioned path ChatGPT uses when you upload a
// picture and ask it to build something around it. A logo is
// mandatory across bannr (see generate/route.js), so there's no
// text-only case and no /v1/images/generations branch to maintain.
// Optional supporting reference images ride along in the same
// image[] array, logo first.
//
// Quality is "medium". Worth re-testing "high" — measured cost per
// image dropped ~62% moving to gpt-image-2 (half the pixel area at
// a lower output rate), so the old "high isn't worth it" call was
// made against a much more expensive baseline.
// ============================================================

export const AI_W = 1536;
export const AI_H = 512;

export function aiEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Shared /v1/images/edits call. Both generation and revision are the
// same request shape — prompt + one or more images in, one image out
// at 1536x512 — so the transport lives in one place and the two
// callers differ only in what they attach and what they say.
async function imagesEdit(prompt, images, { timeoutMs = 95_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    const form = new FormData();
    form.set("model", "gpt-image-2");
    form.set("prompt", prompt);
    form.set("size", `${AI_W}x${AI_H}`);
    form.set("quality", "medium");
    form.set("n", "1");
    images.forEach(({ b64, name }) => {
      form.append("image[]", new Blob([Buffer.from(b64, "base64")], { type: "image/jpeg" }), name);
    });

    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: controller.signal,
      body: form,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error(`OpenAI image request timed out after ${Math.round(timeoutMs / 1000)}s.`);
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    // Content policy refusals surface here — callers turn this into a
    // friendly message + credit refund, never a silent fail.
    const err = new Error(`OpenAI image generation failed (${res.status}): ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return Buffer.from(b64, "base64");
}

// Free content-check diagnosis, used only AFTER a generation was
// refused: one call with the brief text and the logo, and the
// response's category_applied_input_types says whether the words or
// the picture tripped it. That's what lets the UI say "your image
// seems to be the problem — swap it, or let us reimagine it" instead
// of a generic apology. Best-effort: the moderation model is not the
// image model's exact filter, so null/clean means "unknown", never
// "definitely fine".
export async function diagnoseContent({ text, imageB64 } = {}) {
  if (!aiEnabled()) return null;
  const input = [];
  if (text) input.push({ type: "text", text: String(text).slice(0, 2000) });
  if (imageB64) input.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } });
  if (input.length === 0) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r?.flagged) return { flagged: false, image: false, text: false };

    const types = new Set();
    for (const [cat, hit] of Object.entries(r.categories || {})) {
      if (!hit) continue;
      for (const t of r.category_applied_input_types?.[cat] || []) types.add(t);
    }
    return { flagged: true, image: types.has("image"), text: types.has("text") };
  } catch {
    return null; // diagnosis must never become a second failure
  }
}

// Revise a finished banner from a plain-language instruction, with
// optional reference images showing what the user wants added.
//
// The original logo is deliberately NOT re-sent: the banner already
// contains it, and attaching it again would hand the model a second,
// competing copy of the subject. The banner must stay first — the
// prompt refers to it positionally as "the first attached image".
export async function editImage(prompt, { image, refs = [] } = {}) {
  if (!aiEnabled()) return null;
  if (!image) throw new Error("editImage: the banner to edit is required — none was provided.");
  return imagesEdit(prompt, [
    { b64: image, name: "banner.jpg" },
    ...refs.map((b64, i) => ({ b64, name: `ref${i + 1}.jpg` })),
  ]);
}

export async function generateBackground(prompt, { logo, refs = [], styleRefs = [], reimagine = false, restyle = "" } = {}) {
  if (!aiEnabled()) return null;
  if (!logo) throw new Error("generateBackground: a logo is required — none was provided.");

  // Two postures toward the attached identity image:
  //
  // Normal: preserve it. Without this line, /edits tends to let the
  // text prompt dominate and treat the image as loose inspiration.
  //
  // Reimagine: the user's image itself tripped content checks and the
  // user has explicitly opted in to a reinterpretation. So the model
  // is told NOT to copy it — re-illustrate the subject from scratch
  // in a clearly different, tasteful art style that keeps the
  // character recognizable while staying comfortably within policy.
  let finalPrompt =
    prompt +
    (restyle && !reimagine
      // Third posture, for styles that exist to change the rendering.
      // The default line below insists the image's "actual shape and
      // colors" be recognizable, which the model reads as "keep it as
      // drawn" — and it then restyles only the background. This says
      // plainly which parts carry over and which do not.
      ? ` The first attached image shows the project's subject. Redraw it entirely in ${restyle} rather than reproducing it as rendered: its silhouette, proportions, colour identity, features and personality must carry over so it stays unmistakably the same character, but the medium and rendering must be replaced completely. The subject and the scene around it must be drawn in one consistent style — a subject left in its original rendering inside a restyled scene is wrong.`
      : reimagine
      ? " The first attached image shows the project's subject for reference only — do not copy it literally or imitate its exact rendering, and do not reproduce any element of it that would fall outside content policy. Instead, re-illustrate the subject completely from scratch in a different, tasteful art style of your own choosing — soft hand-drawn animation, storybook watercolour, clean vector illustration, claymation, whatever best fits the design — so the result is an original artistic interpretation that keeps the subject's character, colours and spirit recognizable. Getting a beautiful, policy-safe banner out of this reference is the whole assignment."
      : " The first attached image is the project's real identity — its actual shape, colors and character must be genuinely recognizable in the result, reimagined and fused into the scene, not replaced by something merely inspired by it or discarded in favor of the prompt alone.");
  if (refs.length > 0) {
    finalPrompt +=
      ` The next ${refs.length === 1 ? "attached image is supporting" : `${refs.length} attached images are supporting`} subject/mood guidance only — re-illustrate their spirit as part of the same fused idea, don't collage them in as separate layers.`;
  }

  // STYLE REFERENCES — the standard, never the content.
  //
  // The danger with showing examples is obvious: the model copies one
  // and you have swapped a house layout for a borrowed one. So this
  // says, at length and without room for interpretation, that nothing
  // in them is to appear in the banner — and names the specific things
  // it would otherwise lift (layout, subject, palette, type, words).
  //
  // What it asks for instead is the only thing an example can honestly
  // transmit: the BAR. How much care went in, how much emptiness was
  // tolerated, how confidently the type was set. Then it has to design
  // something of its own for this project.
  if (styleRefs.length > 0) {
    const n = styleRefs.length;
    finalPrompt +=
      ` The final ${n === 1 ? "attached image is a STYLE REFERENCE" : `${n} attached images are STYLE REFERENCES`}, and ${n === 1 ? "it is" : "they are"} not part of this project. Nothing in ${n === 1 ? "it" : "them"} belongs in the banner. Do not copy ${n === 1 ? "its" : "their"} layout, composition, subject matter, colour palette, typeface, or any word or logo appearing in ${n === 1 ? "it" : "them"} — a banner that resembles ${n === 1 ? "it" : "any of them"} has failed. ${n === 1 ? "It shows" : "They show"} one thing only: the STANDARD this piece is held to. The level of craft, the confidence to leave space empty, the precision of the typography, the restraint. Read that bar, then design something entirely your own for the project described above, at that quality.`;
  }

  // The logo must stay first — the prompt refers to it positionally
  // as "the first attached image" — and style references must stay
  // last, because the prompt calls them "the final attached images".
  return imagesEdit(finalPrompt, [
    { b64: logo, name: "logo.jpg" },
    ...refs.map((b64, i) => ({ b64, name: `ref${i + 1}.jpg` })),
    ...styleRefs.map((b64, i) => ({ b64, name: `standard${i + 1}.jpg` })),
  ]);
}
