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
      ? " The first attached image is the client's brand mark. Its real shape and colours must be genuinely recognisable in the result — but it is a mark to COMPOSE WITH, the way a designer places a logo on a layout. Do not stand it on a plinth, float it in a room, light it as a hero object, or build a set around it. It has no scene to be fused into."
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
  design: {
    persona: `You are the creative director at a top-tier brand studio, briefing your designers. You produce banner CONCEPTS — the thinking, not the pixels. You are known for ideas that could belong to no other client: you read what a project actually is, what it is named after, what it replaces, what using it feels like, and you find the visual idea hiding in that. The obvious layout bores you.`,
    palette: `- The ${"COUNT"} concepts must be COMPOSITIONALLY unlike each other — different archetypes, not variations of one. Draw from (and go beyond): typography AS the artwork; the mark repeated as pattern or system; a pictorial metaphor filling the frame as a designed ground; an editorial/print layout; an object or material study; a diagram or geometric system that IS the concept.
- FORBIDDEN in every concept: the mark on one side with the name on the other over an empty field. That is the default you exist to beat. Also forbidden: circuit boards, holographic interfaces, floating code, glowing particles, generic futurism, and invented corporate architecture — fictional skyscrapers, office towers or headquarters wearing the client's logo. A real, recognisable place or building is welcome when the project genuinely points at it.
- Each concept: 50–90 words, concrete enough to execute. Name the idea in one sentence, then the composition — what fills the frame, where the project name sits and how large, what the mark is doing, the palette temperature. Concrete nouns, no vibes.`,
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

export async function generateConcepts({ brief, styleBrief, count, constraints = "", director = "design" }) {
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

  const user = `The client needs ${count} distinct concepts for a 1536×512 (3:1) banner. One will be executed per option, so each concept must stand alone.

${facts}

The house style these will be executed in:
${styleBrief}

RULES, non-negotiable:
- DECODE THE BRIEF FIRST. Before ideating, expand every acronym, ticker and named reference using your real-world knowledge: if the brief says MAG7, you know that means the Magnificent Seven — Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, Tesla — and a strong concept works with the real things by name, not "various assets". The model executing your concept has this knowledge too and will render real, recognisable specifics if you name them. Abstracting away something you could have named is the mark of a weak concept.
- Every concept must grow out of what this specific project IS — its business, its name, its metaphors, its world. A concept that would work equally well for an unrelated project is a failed concept. If the name itself contains an image or a pun, that is a gift: at least one concept must use it.
${d.palette.split('${"COUNT"}').join(String(count))}
- Respect the client's own direction and constraints above in every concept.

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
          { role: "user", content: user },
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
