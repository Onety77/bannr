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
// `size` defaults to the banner canvas, which is what every caller
// wanted until the PFP maker needed a square one. Passed rather than
// derived so a wrong value fails loudly at the API instead of being
// silently reshaped afterwards — the pipeline's rule everywhere else
// is that the emitted size is the real size.
async function imagesEdit(prompt, images, { timeoutMs = 95_000, size = `${AI_W}x${AI_H}` } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    const form = new FormData();
    form.set("model", "gpt-image-2");
    form.set("prompt", prompt);
    form.set("size", size);
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

export async function generateBackground(prompt, { logo, refs = [], styleRefs = [], reimagine = false, restyle = "", mark = false } = {}) {
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
      : mark
      // Fourth posture, and the reason it exists is a real failure.
      //
      // The line below this one ends "fused into the scene", and it is
      // appended AFTER the entire prompt — after the framing, after the
      // brand-mark block, last thing the model reads. For a design-led
      // style that quietly overrode everything: the style says compose
      // WITH the mark, and then the final sentence says put it in a
      // scene. Output was three variations of a logo glowing on a
      // plinth in a dark room, every time.
      //
      // So a mark style gets a mark posture in that same last-word
      // position, rather than one written for mascots.
      ? " The first attached image is the client's brand mark. Its real shape and colours must be genuinely recognisable in the result — but it is a mark to COMPOSE WITH, the way a designer places a logo on a layout. Do not stand it on a plinth, float it in a room, light it as a hero object, or build a set around it. It has no scene to be fused into. YOU ARE THE ONLY STAGE THAT CAN SEE THIS MARK, so the exact colours are yours to resolve: read its real hues and choose a colour for the project name, and a relationship between the mark and the ground, that genuinely work with them. Where the concept above describes a palette as warm, cool or high-contrast, that is its temperature and mood — honour it, but derive the actual hues from the mark in front of you. The lettering must never fight the logo it sits beside. Take HUE from the mark, never FINISH: a mark that happens to be rendered in gold, chrome, gloss or 3D does not make the lettering gold, chrome, gloss or 3D. The type takes a flat colour drawn from the mark's palette and nothing else — no metal, no bevel, no extrusion, no reflection, however the mark itself is rendered."
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
      ` The final ${n === 1 ? "attached image is a STYLE REFERENCE" : `${n} attached images are STYLE REFERENCES`}, and ${n === 1 ? "it is" : "they are"} not part of this project. Nothing in ${n === 1 ? "it" : "them"} belongs in the banner. Do not copy ${n === 1 ? "its" : "their"} layout, composition, subject matter, colour palette, LIGHTING, overall darkness or brightness, mood, typeface, or any word or logo appearing in ${n === 1 ? "it" : "them"} — a banner that resembles ${n === 1 ? "it" : "any of them"} in any of those respects has failed. ${n === 1 ? "It shows" : "They show"} one thing only: the STANDARD this piece is held to. The level of craft, the confidence to leave space empty, the precision of the typography, the restraint. Read that bar, then design something entirely your own for the project described above, at that quality.`;
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

// ============================================================
// THE PFP CALL — one image, square, and nothing else attached.
//
// Deliberately NOT routed through generateBackground. That function
// ends by appending one of four postures toward the uploaded image,
// all of them written for a banner: fuse it into a scene, compose
// with it as a mark, re-illustrate it freely. Every one of those is
// wrong here, and the last of them — "reimagined and fused into the
// scene" — is precisely the instruction that would lose the face.
//
// It also has no refs and no style references. A profile picture has
// one input and it is the person's own image; a mood board would only
// give the model permission to drift from it.
// ============================================================
// `images` is one subject seen several ways, never a mood board — all
// of them are named subject{n} for that reason, and the prompt tells
// the model to build one understanding out of the set rather than
// arranging them.
export async function generatePfp(prompt, { images = [], size = 1024 } = {}) {
  if (!aiEnabled()) return null;
  const list = (Array.isArray(images) ? images : [images]).filter(Boolean);
  if (!list.length) throw new Error("generatePfp: an image is required — none was provided.");
  return imagesEdit(
    prompt,
    list.map((b64, i) => ({ b64, name: `subject${i + 1}.jpg` })),
    { size: `${size}x${size}` }
  );
}

// ============================================================
// THE ART DIRECTOR — where the thinking actually happens.
//
// An image model EXECUTES; it does not ideate. Asked to "have an
// idea", it regresses to the most statistically typical banner in its
// training data — which for a tech brief is the mark on one side, the
// name on the other, an empty field between. Months of prompt
// rewrites moved the typography and the taglines but never broke that
// composition, because every rewrite was begging the executor to also
// be the thinker.
//
// So the thinking is a separate, cheap TEXT call. It reads the brief
// the way a creative director would — what is this thing, what is it
// named after, what does using it feel like — and writes one concrete
// concept per variant: the idea, the composition, where the type
// sits, what fills the frame. The image model then executes a
// specific plan instead of averaging toward the default.
//
// Diversity is enforced at THIS layer, where it is enforceable: the
// concepts are written together in one call and required to be
// compositionally unlike each other. That is the difference between
// four options and one option four times.
//
// Fails to an empty array on any error — a generation must never be
// blocked by its own art director.
// ============================================================
// gpt-4o, not gpt-4o-mini — mini was tried and resigned. Given a brief
// saying "MAG7 in one token" it wrote "geometric shapes representing
// diverse assets", while the IMAGE model, left alone on Default mode,
// drew the actual Magnificent Seven logos. An art director with less
// world knowledge than his illustrator is worse than none: his vague
// concept actively suppressed what the executor already knew. The
// pass costs ~$0.008 with 4o against $0.07+ of images it steers.
const CONCEPT_MODEL = process.env.CONCEPT_MODEL || "gpt-4o";

export function parseConcepts(text, count) {
  if (!text) return [];
  // Strict JSON first, fenced JSON second, numbered lines last.
  const tryJson = (s) => {
    try {
      const d = JSON.parse(s);
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.concepts)) return d.concepts;
    } catch {}
    return null;
  };
  let arr = tryJson(text.trim());
  if (!arr) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) arr = tryJson(fence[1].trim());
  }
  if (!arr) {
    const lines = text.split(/\n(?=\s*\d+[.)]\s)/).map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter((l) => l.length > 40);
    if (lines.length >= 2) arr = lines;
  }
  if (!arr) return [];
  return arr.filter((c) => typeof c === "string" && c.trim().length > 0).slice(0, count).map((c) => c.trim());
}

// Two directors, because a brand studio lead is the wrong person to
// brief a meme. The shared half is real — decode the brief, use the
// project's own specifics, make the options genuinely unlike each
// other, be concrete — and the differences are the persona and what
// counts as a failure. A style supplies its own via `concepts: {...}`;
// `concepts: true` gets the design director below.
const DIRECTORS = {
  // THE DEFAULT DIRECTOR — the one that runs when nobody picked a
  // style, which is most people, most of the time.
  //
  // Every other director answers a question already decided for it:
  // make it funny, make it brand-grade, make it a variant set. This
  // one has to make that decision first, and that decision is the
  // highest-leverage thing in the product — a brilliant banner in the
  // wrong register has failed even if it is beautiful. A serious L2
  // rendered as a meme is a worse outcome than a merely competent
  // banner that read the room.
  //
  // Deliberately NOT a router into the seven styles. Those exist for
  // when someone wants a specific treatment; Default is the one you
  // are meant to be able to trust blind, so it carries two promises
  // the specialists do not: the name is always legible, and the
  // subject is never redrawn into another medium. No surprises from a
  // mode nobody made a choice in.
  //
  // It is also the only director given the logo, because it is the one
  // most often working from a thin brief — paste a contract address,
  // press generate, and the description field may well be empty.
  //
  // THE TYPOGRAPHIC OPPORTUNITY LIVES HERE rather than in a style of
  // its own, and that was a real choice. A style has to be chosen,
  // and the people most likely to have a name worth playing with are
  // the ones who paste an address and press generate without ever
  // opening the style picker. Put it behind a card and it reaches
  // nobody. It is also not a look — it is a thing to NOTICE, which
  // is a director's job and not a renderer's.
  default: {
    vision: true,
    persona: `You are the editor-in-chief of a design studio, and your particular gift is knowing what KIND of thing a project is within seconds of seeing it. You have watched brilliant work fail because it was pitched in the wrong register — a serious protocol dressed up as a joke, a community meme coin given a cold corporate treatment — and you regard that as the only truly unforgivable error. You brief the room after you have decided what this is.`,
    palette: `- DIAGNOSE THE REGISTER FIRST, AND NAME IT IN EVERY CONCEPT. Read the name, the description and the attached image together and decide what this project actually is: serious infrastructure, a playful community coin, a premium consumer product, a culture or art project, a piece of pure internet absurdity. Everything else follows from that, and getting it wrong is the one failure that cannot be redeemed by craft. Where the signals disagree — a joke name on a serious protocol, a cute mascot on a real financial product — say which one you are trusting and why.
- THE NAME IS ALWAYS ON THE BANNER, AND ALWAYS LEGIBLE. Nobody chose a text-free style here, so do not invent one. Say where the name sits and how it is set in every concept.
- READ THE NAME AS AN OBJECT, NOT JUST A LABEL. Before deciding where it sits, look at the word itself: its length, its repeated letters, whether it names a shape, a direction, a number or a way of being seen. "Loooong Cat" is asking for its Os stretched the width of the frame. A name that repeats a syllable can become the pattern the whole banner is built from. A name containing "reflected", "double", "half", "upside down" or "twin" is describing something the letters can literally do. Where an opportunity like that is genuinely present, ONE concept should take it and play it dead straight.
- WHAT PLAYS IS THE WORD'S STRUCTURE, NEVER ITS FINISH. Length, repetition, mirroring, scale, curve, where it sits on the page — those are the word doing what it already says. Setting a name alight because the project is called Inferno is the opposite of this and is always wrong: that decorates letters with a mood the name merely suggested. Stretching the Os in Loooong is not decoration, it is the word being read properly. The letterforms themselves stay clean either way — no metal, no bevel, no glow, no 3D extrusion.
- MOST NAMES OFFER NOTHING HERE, AND THAT IS FINE. Do not manufacture it. Invented wordplay is the fastest way to look cheap, and a clean confident setting beats a pun that had to be forced. Look, and if there is nothing there, move on without mentioning it.
- SUBJECT ON ONE SIDE, NAME ON THE OTHER IS NOT THE ONLY LAYOUT, and it is the one you will reach for without noticing. It must not be where all of your concepts land. At least one should put the type somewhere that arrangement cannot: across the subject, curved around it, behind it, filling the frame as the artwork itself, or very small against a very large image. A clean symmetrical layout can still be the best answer — but as a decision you would defend, not the shape you arrive at by not deciding.
- NEVER REDRAW THE SUBJECT INTO A DIFFERENT MEDIUM. No anime-ification, no restyling, no reinterpreting it as another kind of illustration. It can be placed, scaled, cropped, lit, silhouetted, repeated, composed with — never replaced. Someone who did not ask for a transformation must not receive one.
- THE ${"COUNT"} CONCEPTS MUST BE GENUINELY DIFFERENT BANNERS, not one idea at three angles. Different composition, different relationship between subject and type, different ground. If two of them could be described in the same sentence, rewrite one.
- THE REGISTER IS NOT AN EXCUSE FOR ITS CLICHES. Every register has a lazy default and choosing the register correctly does not entitle you to it. Serious technology does not mean glowing circuitry, neon gradients, fusion reactors, holographic interfaces, floating code or abstract "digital networks" — that is the visual language of a stock illustration, and it says nothing about what this particular protocol does. A playful coin does not mean explosions, money raining or rocket ships. Find the image that belongs to THIS project; the cliche is what you reach for when you have not.
- BE THE BEST VERSION OF THE REGISTER YOU CHOSE, not a hedge between registers. Having decided this is a playful community coin, commit to that completely — a banner trying to be both serious and fun is neither. The diagnosis earns you the right to be bold.
- Each concept: 50–90 words, concrete enough to execute. Name the register in the first clause, then the composition — what fills the frame, what the subject is doing, where the name sits and how large, the palette. Concrete nouns, no vibes.`,
  },

  design: {
    persona: `You are the creative director at a top-tier brand studio, briefing your designers. You produce banner CONCEPTS — the thinking, not the pixels. You are known for ideas that could belong to no other client: you read what a project actually is, what it is named after, what it replaces, what using it feels like, and you find the visual idea hiding in that. The obvious layout bores you.`,
    palette: `- The ${"COUNT"} concepts must be COMPOSITIONALLY unlike each other — different archetypes, not variations of one. Draw from (and go beyond): typography AS the artwork; the mark repeated as pattern or system; a pictorial metaphor filling the frame as a designed ground; an editorial/print layout; an object or material study; a diagram or geometric system that IS the concept.
- FORBIDDEN in every concept: the mark on one side with the name on the other over an empty field. That is the default you exist to beat.
- ALSO FORBIDDEN, and this list is not negotiable however well you think you can execute one: circuit boards, circuit traces or PCB patterns in any role — background, texture, border, or the surface the type sits on. Hexagon grids. Wireframe globes. Floating code, binary digits, terminal windows, drifting interface panels. Glowing particle fields, data streams, network-node constellations. Invented corporate architecture — fictional skyscrapers, office towers or headquarters wearing the client's logo. A real, recognisable place or building is welcome when the project genuinely points at it.
- A CRYPTO OR INFRASTRUCTURE PROJECT IS NOT A LICENCE FOR ANY OF THAT. It is the exact brief that attracts it, which is why the list exists. The project does something specific — indexes, swaps, lends, stores, routes — and the image comes from THAT, or from what it is named after, or from what it replaces. If your concept could be described as "a technical-looking surface", you have not had an idea yet.
- THE REGISTER OUTRANKS THE NAME. A serious technology company called Decay, Inferno or Skull is still a serious technology company, and its banner is not an illustration of decay, fire or skulls. A name can honestly earn a palette, a texture, a single quiet motif — it does not license setting the wordmark alight, cracking it apart, rotting the page or building the whole composition out of the noun. The client has real working technology and it deserves the same seriousness whatever they called it.
- THE TYPE STAYS CLEAN. Brand-grade typography is confident and undecorated — the idea lives in the composition, not in the letterforms. TWO families of decoration are equally fatal and you must propose neither. Distress: flames, cracks, drips, rust, glitching, erosion. Polish: metallic, chrome or gold fills, bevel and emboss, drop shadows and outer glows, extruded or three-dimensional letters, gradients poured down the type, reflections and specular highlights. The second family is the one that slips through, because it looks expensive — it is not, it is a Photoshop layer effect, and it reads as amateur to precisely the clients this style exists for. So never describe the name as gold, metal, chrome, glowing, extruded or 3D. Describe how it is SET: weight, scale, case, tracking, alignment, how much room it is given, what it sits on. If the finished type looks like a layer effect was switched on, the piece has failed however clever the idea behind it was.
- YOU HAVE NOT SEEN THE LOGO, AND THAT IS DELIBERATE — it is why you can propose a ground that contrasts with a mark instead of echoing it, which is most of what makes these look designed rather than assembled. But it means you do not know what colour anything actually is. So describe the palette by TEMPERATURE and ROLE — warm, cool, high-contrast, near-monochrome, one accent against a neutral field — and never name a specific colour for the project name or for the mark itself. Those are resolved at execution by the stage that can see them. Naming a hue you have not seen is how a gold wordmark ends up beside a blue logo.
- Each concept: 50–90 words, concrete enough to execute. Name the idea in one sentence, then the composition — what fills the frame, where the project name sits and how large, what the mark is doing, and the palette by temperature and role. Concrete nouns, no vibes.`,
  },

  // The meme director. This style was the least predictable in the
  // whole product — sometimes very funny, sometimes nonsense — because
  // "be funny" was being asked of a renderer. Comedy is a reasoning
  // act: you have to know what the thing IS before you can know what
  // is funny about it. Same architecture as Tech, different brain.
  meme: {
    persona: `You are a comedy director who understands internet culture the way a stand-up understands a room. You brief illustrators on meme banners, and you know exactly why memes work: a specific idea, told sideways — a situation, a juxtaposition, a truth everyone recognises but nobody says. You have contempt for "random equals funny". Randomness is what people reach for when they could not find the joke.`,
    palette: `- FIND THE JOKE BEFORE THE PICTURE. Work out what is genuinely funny about THIS subject and THIS project: the character's expression and what it seems to be thinking, what the name puns on, what the project does and the gap between how seriously it takes itself and what it actually is, what this community would recognise instantly. The joke comes from that. A joke that could be told about any other mascot is not a joke, it is a template.
- The ${"COUNT"} concepts must use DIFFERENT COMIC MECHANISMS, not three angles on one gag. Draw from (and go beyond): the character in an absurd situation played completely straight; a juxtaposition of scale or context; deadpan understatement where almost nothing happens; total unearned confidence; a recognisable genre or format parodied (nature documentary, oil painting, safety poster, sports photography, renaissance fresco); the character caught mid-consequence.
- IT HAS TO LAND WITHOUT A CAPTION. The banner carries the project name as branding, never as a punchline, and there is no room for a setup line. If the concept needs words to be funny it has failed — the image alone must do it, in about one second, on a phone.
- FORBIDDEN: relying on text to carry the joke; borrowed meme furniture the subject is not (wojak, pepe, doge, distracted boyfriend) unless the uploaded subject genuinely IS that; explosions, money raining and rocket ships as generic hype; chaos or randomness standing in for a joke; anything that needs explaining.
- COMMIT. A joke told hesitantly is not funny. Each concept should be executed with the straightest possible face — the funnier the premise, the more serious the craft.
- Each concept: 50–90 words, concrete enough to execute. Name the joke in one sentence, then the picture — what the character is doing, its expression, where it is, what else is in frame, and where the project name sits. Concrete nouns, no vibes.`,
  },

  // The collection director. Collectibles was the clearest case of a
  // fixed prompt producing a fixed look: every hand-cut banner came
  // back as white polaroid borders on white, every grid as thin white
  // lines. Convergent output is a branding problem — twenty of them
  // and the style is recognisable as bannr's, which is the opposite of
  // what a project is buying.
  //
  // So the physical presentation is decided per option here: the
  // ground, the edge treatment, the arrangement. The user's settings
  // arrive as constraints and are honoured; the job is to find a fresh
  // interpretation WITHIN them, not to ignore them.
  // The anime director. This style had the same disease Tek had —
  // subject one side, name the other, over a gradient — and the same
  // cause: an image model asked to compose rather than execute. But
  // anime is the case where a reasoning model brings the most, because
  // the genre has an enormous and very specific visual grammar (key
  // visuals, eyecatches, cour posters, ED cards, genre and era
  // conventions) that a text model knows in detail and a renderer will
  // only reach if something names it.
  anime: {
    persona: `You direct key visuals for anime — the posters, cour art, eyecatches and title cards a studio puts out for a series. You know the grammar cold: how a shounen key visual differs from an iyashikei one, what a Shinkai sky does that a Kyoto Animation interior does not, how 90s cel art frames a character against a horizon versus how a modern digital production layers atmosphere. You have never in your life composed a key visual as a character on one side and a logo on the other.`,
    palette: `- CAST THE PROJECT FIRST. Decide what this project would BE as a series, and let everything follow: a shounen tournament arc, a slice-of-life about a quiet café, a cyberpunk crime thriller, a mecha war epic, an iyashikei about a countryside summer, a sports drama, a magical-girl transformation show, a psychological mystery. The choice must come from what the project actually is and what its subject looks like — a cosy plushie mascot is not a mecha epic. Then direct as if this key visual were promoting that series.
- THE ${"COUNT"} CONCEPTS MUST BE DIFFERENT SHOT TYPES, not one idea reshot. Anime has real formats and you should use them: the key visual with the character mid-stride against a vast sky; the low-angle hero shot at golden hour; the quiet iyashikei wide where the character is small in a landscape; the eyecatch — a tight, graphic, high-contrast card; the manga-panel composite; the ED card with the character in silhouette against a flat colour field; the group-shot cour poster; the over-the-shoulder cinematic with foreground bokeh.
- FORBIDDEN: the subject on one side with the name on the other over a gradient — that is the layout you exist to replace, and it is what this style keeps producing. Also forbidden: sakura petals, generic speed lines, floating magical sparkles and glowing runes used as filler rather than because the scene earns them.
- NAME THE LIGHT. Anime is a lighting medium before it is a drawing medium. Every concept must say what the light is doing: rim light from a setting sun, cool moonlight through a window, the blown-out white of an overexposed sky, neon spill on wet asphalt, an interior lit by a single lamp, backlight through leaves. "Dramatic lighting" is not an answer.
- THE TYPE IS PART OF THE ARTWORK. Say where the project name sits and how it is set — a title logo low-centre with a thin rule above it, small and tucked into a corner like a broadcast credit, large across the top like a cour poster, vertically down one edge. Latin letterforms only: do not ask for Japanese characters, which come back malformed and read as a mistake to anyone who can read them.
- THE SUBJECT STAYS THE SUBJECT. It is being redrawn in anime style, not replaced — its silhouette, proportions, colours and character must survive the redraw. Never invent a different character.
- Each concept: 50–90 words, concrete enough to execute. Name the genre, the shot, the light, the setting, and where the name sits.`,
  },

  // The presence director. The obvious risk with directing this style
  // is that a director reaches for scenes, props and incident — the
  // exact things the brief spends its whole length forbidding. So the
  // rules here are as much about restraint as invention: the job is to
  // choose WHICH of a small set of levers carries the presence, and to
  // specify it precisely, not to add anything to the frame.
  // The presence director.
  //
  // Kept deliberately shorter than it wants to be. Each failure found
  // in testing added a rule and none ever removed one, until this was
  // 886 words of checklist against the design director's 248 — and a
  // director reading a checklist stops directing and starts complying,
  // which is the opposite of the point. Two rules were cut as genuinely
  // redundant rather than merely long: a quota capping how many options
  // could make the subject small (the different-levers rule already
  // makes it impossible for all of them to), and two of the three
  // separate rules saying not to alter the subject.
  //
  // What survived, survived because it fixed something real.
  him: {
    // ══ THE SECOND DIRECTOR GIVEN THE PICTURE ══
    //
    // Every instruction below is about a property of the subject:
    // what authority it has, what it is made of, what it is coloured
    // like, what the light should rim. Written blind, all of that was
    // inferred from a token name — and a name gives you the noun,
    // never the bearing. "$WOLF" does not say snarling or serene,
    // woven or chromed, heavy or slight.
    //
    // The reason `design` is deliberately blind does not transfer:
    // that is about not echoing a brand MARK on a designed surface,
    // where matching its colours makes the piece look assembled. This
    // style does not compose around a mark, it stages a subject —
    // the subject IS the content, and taking the ground from it is
    // the correct move rather than the lazy one.
    //
    // ══ AND SEEING IT MADE IT LITERAL, WHICH IS THE TRAP ══
    //
    // The first version of this told it to "derive the ground from the
    // material you actually see". It read that as continue the
    // backdrop: every concept became an extension of whatever room
    // the subject was photographed in, and the invention — the part
    // that made this style worth having — stopped.
    //
    // That is what showing a model an image does by default: it
    // describes and continues rather than reasons. So the brief now
    // separates the two jobs explicitly. The image answers WHAT THIS
    // IS; where it goes is still invented, and the levers it can pull
    // are named one by one so "direct it" is a list rather than a
    // hope.
    //
    // ONE FLAG. Set this to false and everything reverts.
    vision: true,
    persona: `You are a portrait cinematographer. You are hired when something has to look monumental, and you have never once achieved that with props. You do it with distance, with one light, with what you leave out of frame. You can look at a subject and tell instantly what kind of authority it has — menacing, serene, weary, regal, deadpan, unbothered — and you stage for that specific quality rather than a generic idea of "epic".`,
    palette: `- THE SUBJECT IS ATTACHED, AND IT TELLS YOU WHAT THIS IS — NEVER WHERE IT GOES. Look at it before deciding anything: its posture, where it is already looking, whether it is heavy or slight, smooth or matted, warm or cold, drawn or rendered or photographed. A name gives you the noun and nothing about the bearing, and the bearing is the entire job here.
- WHATEVER IS BEHIND IT IN THAT IMAGE IS NOT PART OF THE BRIEF. It is the background of a photograph somebody happened to take, and continuing it is the one failure that seeing the subject makes easy. A cat photographed on a sofa is a cat; it is not a sofa brief. You now know it is stocky, unbothered and ginger — so decide where THAT belongs, and it is almost never where it currently is. Extending the backdrop you were shown is not direction, it is tracing.
- THE ENVIRONMENT IS YOURS TO INVENT, and inventing it is the job. Seeing the subject is meant to make the invention sharper, not smaller: a serene, weighty thing earns a still lake at dawn or a vast pale room; a scrappy one earns wet asphalt under a streetlight. Say what you saw, then say what you are putting it in and why that answers it.
- IT IS A FRAME FROM A FILM, NOT AN ILLUSTRATION OF A CHARACTER. Every concept should read like a still someone pulled out of a scene that was already running — the subject caught mid-moment rather than posed for us, the world continuing past the edges of the frame, one lighting setup that a crew could actually have rigged. Wide and shallow: the subject resolved, everything behind it falling away. That is what makes this style worth choosing over a portrait.
- CINEMATIC IS A CRAFT, NOT A FILTER, and the difference is the whole thing. It is the lens, the light and the moment: long focal length, one motivated source, real falloff into shadow, air you can see the light travelling through. It is NOT teal-and-orange grading, lens flares, letterbox bars, film grain laid over the top, or "epic" as a mood. Those are what someone adds when the framing did not do the work. If the concept would still read as a film still in flat grey light, it is right.
- READ THE SUBJECT FIRST, then stage for the authority it actually has. A snarling animal, a serene one, a chunky comic one and a weary one each command a frame differently. Say in the concept what quality you are staging for.
- EACH CONCEPT LEADS WITH A DIFFERENT LEVER, and these are the levers. The ${"COUNT"} options must not reach for the same one twice:
    · SCALE — enormous, cropped hard by the frame.
    · THE CROP ITSELF — in to the eyes alone, the rest of the face running off every edge. Cutting a subject is a decision, not damage.
    · EMPTINESS — small in a vast field, at the point of highest contrast.
    · LIGHT ALONE — one hard source in near-darkness; or rimmed from behind so the edge burns and the front falls away.
    · ATMOSPHERE — fog, haze, dust, rain, smoke moving through the beam.
    · DEPTH — the world behind thrown far out of focus, the subject the only thing resolved.
    · PLACEMENT — sitting high with the ground falling away, or low with something vast above.
  Every one of these is a thing you DO to the frame. A concept that names none of them has described a picture rather than directed one.
- THE GROUND COMES FROM WHAT THE SUBJECT IS MADE OF — never from what happens to be behind it. A woven thing implies fabric and warm fibre; a chrome thing implies cold reflection; a hand-drawn thing implies paper or flat ink. That is a leap FROM its material TO a world, and the leap is the work. Reaching for a black void or grey fog without a reason rooted in the subject is this style's house cliché, and no two grounds in a run may come from the same family.
- YOU HAVE SEEN IT, SO DO NOT DESCRIBE IT BACK. The renderer has the same image and does not need you to inventory its colours or features. What it needs is the STAGING — where it sits, how big, what the light does, what the ground is. Spending your words re-describing the subject is how a concept ends up with no idea in it.
- WHATEVER SCALE YOU CHOOSE, THE EYE MUST LAND ON THE SUBJECT INSTANTLY, on a strip a few centimetres wide on a phone. Small in a vast field is a genuine power move, but only when the subject sits at the point of highest contrast with nothing competing. A subject that has to be hunted for has not commanded the frame, it has vanished from it.
- ALMOST NOTHING ELSE IS IN FRAME. No props, crowds or set dressing, and no explosions, lightning or glowing eyes — those are what people reach for when they cannot make presence any other way. Authority is calm. The ground is one plane and one atmosphere.
- NAME THE LIGHT PRECISELY: where it comes from, how hard it is, its colour temperature, what it rims and what it leaves in shadow. "Dramatic lighting" is not an answer.
- YOU HAVE ONE VIEW OF THIS SUBJECT. The client uploaded a single image; asking for a low angle, an over-the-shoulder or a three-quarter turn forces the renderer to invent surfaces it has never seen, and that is where a subject becomes a lookalike. Imply the viewpoint by arranging the world instead — a low horizon, the ground falling away, light raking up from below — and never by turning what you were given.
- THIS BANNER CARRIES NO TEXT. Do not plan a name, logo or caption anywhere in it.
- Each concept: 50–90 words. Name the quality of presence, the lever, the light, how the subject sits in the frame, and the ground — the ground being somewhere you decided to put it, not the place it was photographed.`,
  },

  // The camera director. HIM's last-but-one rule says the subject has
  // exactly one view and must never be turned; this director exists to
  // do the thing that rule forbids, on the one style where the user
  // asked for it. The two are not in conflict — they are the two sides
  // of a decision, kept in separate styles on purpose.
  //
  // ══ WHY IT MUST SEE THE IMAGE ══
  //
  // Not for register, and not for material. For TOPOLOGY. Whether this
  // subject can be walked around at all is the first question, and it
  // is unanswerable from a name: a wordmark has no back, a badge has no
  // profile, and proposing either one a shot from behind produces
  // nonsense the renderer will dutifully execute. The image is also the
  // only place the identifying features live — the ear shape, the
  // colour split, the hat — and naming them is how a turned subject
  // stays the same subject instead of becoming a lookalike.
  //
  // ══ AND WHY THE VOCABULARY IS NAMED ══
  //
  // Asked for "a different angle", a model returns the same portrait
  // rotated fifteen degrees, three times. That is not a shot, and the
  // difference between it and a real one is not a matter of degree —
  // it is knowing that "from behind at distance", "low and close" and
  // "profile against the light" are separate, nameable things. So they
  // are listed, the way HIM lists its levers, and each option has to
  // take a different one.
  pov: {
    vision: true,
    persona: `You are a director of photography who blocks shots. Handed a character, the first thing you decide is where the camera stands — and you know that decision is the picture, not a setting applied to it. You have spent a career on the difference between a portrait and a shot: a portrait shows someone what a thing looks like, a shot shows them what it is like to be there with it. You also know exactly when a subject cannot be walked around, and you say so instead of forcing it.`,
    palette: `- THE SUBJECT IS ATTACHED AND YOUR FIRST JOB IS TO DECIDE WHAT IT IS PHYSICALLY. Does this thing have a back, a profile, a volume you could walk around — a creature, a figure, a character, an object with real form? Or is it flat — a wordmark, an emblem, a badge, a logotype, a purely geometric mark with a front and nothing else? Everything you propose depends on the answer, and you cannot get it from the name.
- IF IT HAS FORM, MOVE THE CAMERA AROUND IT. Re-pose it. It may be seen from behind, in profile, from below, from above, at a distance, mid-stride, turning away. This is the style working as intended and it is what the client chose it for.
- IF IT IS FLAT, MOVE THE CAMERA AROUND IT AS AN OBJECT INSTEAD — never as a body. A mark seen obliquely as a real printed, cast, painted or built thing: raking across a surface, in perspective, catching light along its face, half in shadow, seen edge-on. Do not propose a back view of a wordmark, do not give an emblem a face to turn, and do not invent a mascot the client did not upload.
- NAME THE SHOT IN THE FIRST CLAUSE OF EVERY CONCEPT, and the ${"COUNT"} concepts must take DIFFERENT ones. These are the shots:
    · FROM BEHIND — over or beside the shoulder, the subject looking out at something, the viewer standing where it stands.
    · PROFILE — the side of the head or body against the light, the view an avatar can never show.
    · LOW — camera near the ground looking up, the subject rising over the horizon line.
    · HIGH OR DISTANT — small in a wide world, seen from above or far off, the silhouette doing the work.
    · CLOSE ON A DETAIL — one part filling the frame: the eye, the hand, the paw, the texture, the edge of the object.
    · THREE-QUARTER TURN — halfway between the upload and profile, caught looking off-frame.
    · MID-MOVEMENT — walking in, walking out, turning, the frame catching it in passing.
  A concept that does not name one of these has not directed a shot. Rotating the head-on portrait slightly is not a shot.
- THE SHOT MUST BE MOTIVATED BY WHAT THIS SUBJECT IS. From behind works when there is something worth looking at and the character has some claim on it. Low works when the thing should feel larger than the viewer. Close works when the detail is genuinely characteristic. Distant works when belonging to a place is the point. Say in one clause why THIS angle for THIS subject — an angle chosen at random reads as arbitrary even when it is beautiful.
- PROTECT THE LIKENESS, EXPLICITLY, IN EVERY CONCEPT. Look at the subject and name the two or three things that make it recognisable — the ear shape, the mane, the hat, the colour split, the build, the way it slumps. Then state which of them your angle keeps visible. A view that hides every identifying feature at once is not usable however good it looks: a character whose identity is all in its face is shot from behind with the head turned enough to catch the profile, or with the ears and outline carrying it. This is the one failure this style is capable of that the others are not, and catching it is your job, not the renderer's.
- SAME CHARACTER, NOT A SIMILAR ONE. The renderer will redraw the subject to make your angle possible, and it needs to be held to the original: same species, build, proportions, colour identity, markings, costume and drawing medium. Never propose a change to any of those, and never describe the subject as anything other than what you can see it is.
- IT IS NOT LITERAL POINT-OF-VIEW. The camera is not the subject's eyes and the frame is not what the subject sees. The subject is in the picture. A concept where the subject does not appear is a failed concept.
- COMPOSE THE EMPTY PART ON PURPOSE. These shots naturally open up a large calm area — sky over a low horizon, the ground in front of a figure, the space a profile faces into. Say where that area is and say that the project name sits in it, at what size. Planning the shot and then hunting for somewhere to put the name is how these end up with type jammed into a corner.
- NAME THE LIGHT: where it comes from, how hard, what temperature, what it rims and what it leaves dark. A back view in particular lives or dies on it — the silhouette has to separate from what is behind it. "Dramatic lighting" is not an answer.
- Each concept: 50–90 words. The shot first, then why it suits this subject, then what keeps it recognisable, then the setting, the light, and where the name sits.`,
  },

  collectibles: {
    persona: `You are the art director for a collectible line — sticker sheets, trading cards, blind-box series, enamel pin sets. You have made hundreds of these and you can tell instantly when a set was laid out by a template rather than designed. Your signature is that none of your sets look alike: the ground, the edges and the arrangement are chosen fresh for each subject, because that is what makes a set feel made rather than generated.`,
    palette: `- THIS BANNER CARRIES NO TEXT. Do not plan a name, caption, label or logo anywhere in it. The set speaks entirely through the character and its variations.
- DECIDE THE PHYSICAL OBJECT. Every concept must name three things concretely: the GROUND the set sits on, the EDGE treatment of each cell (die-cut sticker outline, torn paper, brush-inked frame, deckle edge, perforated stamp border, taped corners, comic gutters, none at all), and the ARRANGEMENT (even grid, unequal cells, one hero panel among smaller ones, staggered rows, a strip, a free-form scatter). Vague presentation is the failure mode here.
- THE GROUND IS A SURFACE, NOT A SCENE. It is the material the set is printed on or pinned to — kraft paper, newsprint, dark velvet, worn cardboard, graph paper, a flat brand colour, painted board, foil. It is NOT a place: not a beach, not a pirate ship, not a forest, not a city. It should be quiet and almost plain, because the variations are the subject and anything richer behind them is competition. If someone describes the banner afterwards they should talk about the character, never about the background.
- AND THE GROUND MUST NOT DICTATE THE VARIATIONS. This is the trap: choose a nautical ground and every variation drifts nautical, and the set becomes twelve pirates. The surface and the variations are INDEPENDENT decisions. Never theme them to match.
- THE ${"COUNT"} CONCEPTS MUST LOOK PHYSICALLY DIFFERENT FROM EACH OTHER, not merely hold different outfits. Different ground, different edges, different arrangement in each. Two banners from the same run should not be identifiable as a pair.
- NEVER DEFAULT TO white rectangular panels with thin white gutters on a white ground. That is the template every set collapses into, and it is the specific thing you exist to avoid.
- THE VARIATIONS ARE THE POINT — they are what the set is FOR, and they must range widely. Reach across unrelated worlds in a single set: a profession, a season, a sport, a film genre, a historical period, a hobby, a mood, a small joke. A set where every variation shares one theme is a narrower product than one where they do not, unless the client asked for a tight range. They come from THIS character and THIS project — what it is, what its community would find delightful, what it would plausibly wear — and generic costume swaps (santa hat, sunglasses, chef) are the weakest possible answer; earn each one.
- THE CHARACTER IS IDENTICAL IN EVERY CELL. Same proportions, same pose, same framing, same face. Only accessories, clothing, props and small contextual details change. This consistency is the whole appeal of a variant set.
- Each concept: 50–90 words, concrete enough to execute. Name the ground, the edges, the arrangement, and then a handful of variations that clearly belong to different worlds from one another.`,
  },
};

export async function generateConcepts({ brief, styleBrief, count, constraints = "", perConcept = [], director = "design", logo = null }) {
  if (!aiEnabled() || count < 1) return [];

  const facts = [
    `Project name: ${brief.name}`,
    brief.ticker ? `Ticker: ${brief.ticker}` : "",
    brief.tagline ? `Tagline (client-written): ${brief.tagline}` : "",
    brief.vibe ? `What it is: ${brief.vibe}` : "What it is: not stated — infer everything from the name.",
    brief.direction ? `The client's own direction (this outranks everything): ${brief.direction}` : "",
    constraints ? `Standing constraints from the client's settings:\n${constraints}` : "",
  ].filter(Boolean).join("\n");

  const d = DIRECTORS[director] || DIRECTORS.design;
  const sys = d.persona;
  // Only directors that ask for it get the picture. Vision changes the
  // character of the output, so it is opted into per director rather
  // than switched on everywhere at once — if it turns out to help, the
  // others can follow one at a time and we will know which change did
  // what.
  const seesLogo = Boolean(logo && d.vision);

  // ══ PRE-ASSIGNED, WHEN THE CLIENT ASSIGNED IT ══
  //
  // Empty on almost every run. It fills when a control was given
  // several answers — a palette of dark, light and vibrant; POV's
  // shot list; three anime eras — because the point of that is seeing
  // them side by side in one run instead of paying three times to see
  // them one at a time.
  //
  // It has to be stated as an assignment rather than a menu. Handed
  // the three as a pool, a director writes three concepts drawing on
  // whichever it likes best and the mapping to options is lost; the
  // image prompt for option 2 then carries a concept written for
  // option 1's settings and a direction demanding its own, which is a
  // contradiction the renderer resolves at random.
  const assigned = perConcept.filter(Boolean).length
    ? `\nASSIGNED PER CONCEPT — the client chose these themselves, one set per option, and the numbering is fixed. Concept 1 must be built on the first, concept 2 on the second, and so on. This is not a menu to choose from and not a set of suggestions: each concept is being executed with the settings named for it, so a concept written against different ones will be rendered against its own description and fight it.

${perConcept.map((p, k) => `Concept ${k + 1}: ${p || "nothing assigned — decide this one yourself, and do not duplicate what another concept was given."}`).join("\n\n")}

Everything else is still yours, and these do not shrink the job. What the subject is doing, where it is, what the light is doing and where the name sits are all still your decisions — treat what is assigned as the starting condition you are designing into, and make each concept the best possible version OF the one it was given rather than a compromise around it.\n`
    : "";

  const user = `The client needs ${count} distinct concepts for a 1536×512 (3:1) banner. One will be executed per option, so each concept must stand alone.

${facts}

The house style these will be executed in:
${styleBrief}

${seesLogo ? "THE PROJECT'S LOGO OR MASCOT IS ATTACHED. Look at it before you write anything. What it IS — a hand-made plushie, a crisp geometric mark, a 3D render, a photograph, a scrappy drawing — tells you more about the register this project belongs in than any text field, and on a thin brief it may be the only real signal you have. Every concept must be one this particular image could actually carry.\n\n" : ""}RULES, non-negotiable:
- DECODE THE BRIEF FIRST. Before ideating, expand every acronym, ticker and named reference using your real-world knowledge: if the brief says MAG7, you know that means the Magnificent Seven — Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, Tesla — and a strong concept works with the real things by name, not "various assets". The model executing your concept has this knowledge too and will render real, recognisable specifics if you name them. Abstracting away something you could have named is the mark of a weak concept.
- Every concept must grow out of what this specific project IS — what it does, who it is for, the world it comes from. A concept that would work equally well for an unrelated project is a failed concept. A name containing an image or a pun is ONE available route in, never an obligation and never the whole idea: what the project DOES outranks what it is called, every time.
${d.palette.split('${"COUNT"}').join(String(count))}
- Respect the client's own direction and constraints above in every concept.
${assigned}
Return strict JSON: {"concepts": ["...", "..."]} with exactly ${count} strings. No other text.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: CONCEPT_MODEL,
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: seesLogo
              ? [
                  { type: "text", text: user },
                  // "low" detail on purpose: the question is what KIND
                  // of thing this is — a wonky crochet cat, a clean
                  // geometric mark, a 3D render — and that reads at a
                  // glance. Fine detail would cost several times more
                  // to answer a question nobody asked.
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${logo}`, detail: "low" } },
                ]
              : user,
          },
        ],
        // High temperature ON PURPOSE: this is the one call in the
        // whole pipeline whose entire job is divergence.
        temperature: 1.0,
        max_tokens: 220 * count + 100,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error(`[concepts] ${res.status} ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    const out = parseConcepts(data?.choices?.[0]?.message?.content || "", count);
    console.log(`[concepts] ${out.length}/${count} generated`);
    return out;
  } catch (e) {
    console.error("[concepts]", e.name === "AbortError" ? "timed out after 20s" : e.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
