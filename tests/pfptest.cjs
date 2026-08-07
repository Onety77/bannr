// THE PFP MAKER.
//
// Two things carry this feature and everything else is scaffolding:
// the subject survives, and the screenshot furniture does not. Both
// are prompt properties, so both are tested against the real builder
// rather than by reading for a string.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/^\s*\/\/.*$/gm, "");

const PFP = read("lib/pfp.js");
const META = read("lib/pfpStyles.js");
const ROUTE = read("app/api/pfp/route.js");
const UI = read("components/PfpMaker.jsx");
const PAGE = read("app/create/page.jsx");
const OAI = read("lib/openai.js");
const CSS = read("app/globals.css");

// lib/pfp.js is server-only; run it the way the other prompt tests do.
// Re-export lines (`export { x } from "./y"`) have to be dropped
// entirely, not just de-`export`ed — stripping the keyword leaves
// `{ x } from "./y"`, which is a syntax error. lib/styles.js is
// inlined first so the real distributeStyles is in scope.
const strip = (s) =>
  s.replace(/^export \{[^}]*\} from[^\n]*$/gm, "")
   .replace(/^import[^\n]*$/gm, "")
   .replace(/^export /gm, "");

// Passed IN rather than inlined: lib/styles.js exports STYLES and
// lib/pfp.js declares its own const STYLES, so concatenating the two
// is a redeclaration. It is the real function either way — pulled out
// of the real module in its own scope first.
const distributeStyles = new Function(strip(read("lib/styles.js")) + "\nreturn distributeStyles;")();

const M = new Function(
  "distributeStyles",
  strip(META) + "\n" + strip(PFP) +
  "\nreturn { buildPfpPrompt, PFP_STYLES, PFP_SIZE, PFP_MAX, PFP_COST, PFP_TEXT_MAX, PFP_WANTS_MAX, PFP_IMAGES_MAX, getPfpStyle };"
)(distributeStyles);
M.distributeStyles = distributeStyles;

console.log("\n1. FOUR STYLES, AND THE NUMBERS THAT WERE ASKED FOR");
{
  ok(M.PFP_STYLES.length === 4, "four styles (" + M.PFP_STYLES.map((s) => s.id).join(", ") + ")");
  ok(M.PFP_STYLES.map((s) => s.id).join() === "default,glow,solid,anime", "in the order they were specified");
  ok(M.PFP_SIZE === 1024, "square at 1024");
  ok(M.PFP_MAX === 2, "two options per round, max");
  ok(M.PFP_COST === 1, "one credit each");
  ok(M.PFP_STYLES[0].id === "default", "and Default is the default");
  // Only the solid style takes a parameter.
  ok(Array.isArray(M.getPfpStyle("solid").swatches), "solid carries swatches");
  ok(M.getPfpStyle("solid").swatches[0].v === "", "  with Auto first — the model reads the subject and picks");
  ok(!M.getPfpStyle("glow").swatches && !M.getPfpStyle("anime").swatches, "and no other style does");
  ok(M.getPfpStyle("nonsense").id === "default", "an unknown id falls back rather than throwing");

  // The metadata/prompt split, same as styles.js against templates.js.
  ok(/import "server-only"/.test(PFP), "the prompts are server-only");
  ok(!/^import "server-only"/m.test(META), "the metadata is not");
  ok(/from "@\/lib\/pfpStyles"/.test(UI), "and the client component reads the metadata file");
  ok(!/from "@\/lib\/pfp"/.test(UI), "  never the prompt file, which would bundle every prompt");
}

console.log("\n2. THE SCREENSHOT IS THE PRODUCT");
{
  const p = M.buildPfpPrompt("default");
  // The input people actually have: a portrait phone screenshot,
  // compressed, with the app's furniture on top. A model handed that
  // and asked for "a profile picture" returns it cropped square.
  ok(/Expect a phone screenshot/.test(p), "the source is assumed to be a screenshot");
  ok(/FIND THE SUBJECT INSIDE IT/.test(p), "and the subject has to be found inside it");
  ok(/NONE OF THE INTERFACE SURVIVES/.test(p), "the interface is removed, not cropped around");
  ok(/remove it completely rather than blurring, covering or cropping around it/.test(p),
     "  and the three cheap ways out are named");

  // The list is unconditional on purpose — asked to classify first, a
  // model decides it is not a screenshot and skips the cleanup, and
  // the ambiguous cases are exactly the ones that matter.
  for (const chrome of [
    "usernames", "@handles", "captions", "hashtags",
    "like, comment, share", "play and pause triangles", "progress and seek bars",
    "Follow and Subscribe buttons", "verification ticks",
    "status bar", "battery", "carrier", "notch",
    "burned-in subtitles", "auto-captions", "watermarks",
    "letterbox bars",
  ]) {
    ok(p.includes(chrome), "  names " + chrome);
  }
  ok(/not contain one readable letter, digit, icon or fragment of a bar/.test(p), "with a flat bar at the end");
  ok(/a like count in the corner is a failed profile picture/.test(p), "and the failure named concretely");

  // Multiple subjects — the client asked for this explicitly.
  ok(/If two or three belong together/.test(p), "several subjects can be kept together");
  ok(/if one is plainly the subject and the rest is background, crowd or incidental/.test(p),
     "  and a crowd does not become the subject");
}

console.log("\n3. THE SUBJECT SURVIVES, WHICH IS THE WHOLE PRODUCT");
{
  const p = M.buildPfpPrompt("default");
  ok(/IT MUST STILL BE THEM/.test(p), "fidelity is a headline, not a clause");
  // Written as the consequence, because "preserve the subject" is a
  // sentence every prompt contains and no model weighs heavily.
  ok(/An avatar that is ALMOST right is worth nothing/.test(p), "stated as the consequence, not the instruction");
  for (const w of ["the same face", "the same proportions", "the same colours", "the same markings", "the same expression"]) {
    ok(p.includes(w), "  " + w);
  }
  ok(/a hat, glasses, a chain, a cigarette, headphones, a hoodie — is part of who it is and stays/.test(p),
     "accessories are identity, not clutter");

  // THE INSTINCT THAT ACTUALLY BREAKS THIS. It is not laziness, it is
  // the model trying to help — and it does not feel like a mistake
  // while it is happening, so it has to be named as the failure.
  ok(/DO NOT IMPROVE IT/.test(p), "the urge to improve is named");
  ok(/Do not straighten a crooked feature, tidy a rough drawing, prettify a face/.test(p), "  concretely");
  ok(/If it is a badly drawn frog, the answer is that same badly drawn frog/.test(p), "  and settled with an example");
  // But the medium may be repaired — otherwise a low-res screenshot
  // stays a low-res avatar, which is the other half of the job.
  ok(/You may repair the MEDIUM, never the subject/.test(p), "while compression damage may still be fixed");
  ok(/That is sharpening a photograph, not redrawing what it shows/.test(p), "  with the line drawn");
}

console.log("\n4. SQUARE, AND READ AT FORTY PIXELS");
{
  const p = M.buildPfpPrompt("glow");
  ok(/THE FRAME IS A PERFECT SQUARE/.test(p), "square is stated");
  ok(/Do not letterbox, do not pad with bars/.test(p), "and letterboxing — the reflex — is refused");
  ok(/THE SUBJECT IS LARGE IN THE FRAME/.test(p), "the subject fills it");
  ok(/A subject stranded small in the middle of a square/.test(p), "  with the common bad avatar named");
  // Nobody prompts for this and every good avatar obeys it.
  ok(/SEEN AS A CIRCLE THE SIZE OF A FINGERNAIL/.test(p), "it is composed for the size it is actually seen at");
  ok(/keep nothing important in the corners, which are cut off/.test(p), "  corners are lost to the circle crop");
  ok(/Fine detail, thin lines and subtle gradients disappear entirely at that size/.test(p),
     "  and fine detail is pointless there");
}

console.log("\n5. THE STYLES DIFFER, AND ONLY ONE REDRAWS");
{
  const of = (id) => M.buildPfpPrompt(id);
  ok(/read the subject and make the right call yourself/.test(of("default")), "Default decides for itself");
  ok(/Restraint is the whole style/.test(of("default")), "  and stays restrained");

  // The banner Glow cost a full round trip to learn this: chased away
  // from "neon outline" it becomes a thin crisp rim, which is a
  // sticker. Softness has to lead.
  ok(/IT IS SOFT\. This is the single decision/.test(of("glow")), "Glow leads with softness");
  ok(/Thin, crisp and even is a sticker; soft, gathered and uneven is light/.test(of("glow")),
     "  with the same test that fixed the banner style");
  ok(/no halo floating around the subject as a separate shape/.test(of("glow")), "  and the halo still ruled out");

  ok(/one flat colour, and nothing else/i.test(of("solid")), "Solid is one flat field");
  ok(/no gradient, no texture, no pattern, no vignette/.test(of("solid")), "  with no gradient sneaking in");
  ok(/No fringe of the old background clinging to the edges/.test(of("solid")), "  and a clean cut demanded");
  ok(/Fur, hair and fine edges stay soft/.test(of("solid")), "  without hard-cutting through fur");
  ok(/changes what is BEHIND it, not what it is/.test(of("solid")), "  subject untouched");

  // Anime is the one exception and has to say so, or it is fighting
  // the fidelity block three paragraphs above it.
  ok(/this style is the one exception to the rule above about not redrawing it/.test(of("anime")),
     "Anime declares itself the exception");
  ok(/WHAT MUST SURVIVE IS WHO IT IS/.test(of("anime")), "  and still holds identity");
  ok(/a subject left in its source rendering against an anime background is the failure/.test(of("anime")),
     "  with the half-done failure named");
  // Nothing else may redraw.
  for (const id of ["default", "glow", "solid"]) {
    ok(!/one exception to the rule/.test(of(id)), "  " + id + " gets no such licence");
  }

  const colored = M.buildPfpPrompt("solid", { color: "#2451FF" });
  ok(/it is #2451FF/.test(colored), "a chosen colour reaches the prompt");
  ok(/The colour is yours to choose/.test(of("solid")), "and Auto hands it back to the model");
  ok(!/The colour is yours to choose/.test(colored), "  never both at once");
  ok(!/#2451FF/.test(M.buildPfpPrompt("glow", { color: "#2451FF" })), "colour is ignored on styles without it");
}

console.log("\n6. TEXT IS OFF UNLESS ASKED FOR");
{
  const none = M.buildPfpPrompt("default");
  ok(/NO TEXT\./.test(none), "no text by default");
  ok(/A single readable word is a failed profile picture/.test(none), "  said flatly");

  const named = M.buildPfpPrompt("default", { text: "MOONSOON" });
  ok(/ONE PIECE OF TEXT, and this exact string: MOONSOON/.test(named), "a name reaches the prompt verbatim");
  ok(!/NO TEXT\./.test(named), "  and the ban is gone when it does");
  ok(/must not cross the subject's face/.test(named), "it may not cover the face");
  ok(/no part of any letter may sit near a corner/.test(named), "  nor sit where the circle crop cuts");

  // Bounded, because an unbounded field invites a sentence and a
  // sentence at avatar size is a grey bar.
  const long = M.buildPfpPrompt("default", { text: "x".repeat(80) });
  ok(!long.includes("x".repeat(M.PFP_TEXT_MAX + 1)), "over-long text is truncated in the builder");
  ok(M.PFP_TEXT_MAX <= 16, "  to something that fits a 48px circle (" + M.PFP_TEXT_MAX + ")");
  ok(/NO TEXT\./.test(M.buildPfpPrompt("default", { text: "   " })), "whitespace counts as none");
}

console.log("\n7. THE TWO RULES LAND LAST");
{
  // Models weight the end of a prompt. These are the two whose
  // violation makes the image unusable rather than merely worse.
  const p = M.buildPfpPrompt("anime", { text: "KIO" });
  const tail = p.slice(Math.floor(p.length * 0.75));
  ok(/FINALLY, AND OVER EVERYTHING ABOVE/.test(tail), "a closing restatement sits in the last quarter");
  ok(/must be recognisably the one attached/.test(tail), "  the subject");
  ok(/no circular frame, ring or mask drawn on it/.test(tail), "  and the circle");
  ok(/no part of any app interface, screenshot furniture or unrequested lettering/.test(tail), "  and the chrome");
  ok(p.lastIndexOf("FINALLY, AND OVER EVERYTHING ABOVE") > p.lastIndexOf("THE FRAME IS A PERFECT SQUARE"),
     "and it really is last, after the framing block");
}

console.log("\n8. THE ENGINE CALL IS ITS OWN, NOT THE BANNER'S");
{
  // generateBackground ends by appending one of four postures toward
  // the uploaded image, all written for a banner — and the default one
  // ("reimagined and fused into the scene") is precisely the sentence
  // that would lose the face.
  ok(/export async function generatePfp/.test(OAI), "there is a separate call");
  ok(/list\.map\(\(b64, i\) => \(\{ b64, name: `subject\$\{i \+ 1\}\.jpg` \}\)\)/.test(bare(OAI)),
     "with the subject images and nothing else");
  ok(/generatePfp: an image is required/.test(OAI), "and it refuses to run with none");
  // Slice the RAW text, then strip comments — slicing with indices
  // taken from a different string is how the last three of these
  // silently matched nothing.
  const fn = bare(
    OAI.slice(OAI.indexOf("export async function generatePfp"), OAI.indexOf("// THE ART DIRECTOR"))
  );
  ok(!/fused into the scene/.test(fn), "  no banner posture appended");
  ok(!/styleRefs|refs\b/.test(fn), "  no reference images to drift toward");
  ok(/size = 1024/.test(fn) && /\$\{size\}x\$\{size\}/.test(fn), "and it asks for a square canvas");
  // The size had to become a parameter for that to be possible.
  ok(/size = `\$\{AI_W\}x\$\{AI_H\}`/.test(OAI), "imagesEdit still defaults to the banner canvas");
  ok(/form\.set\("size", size\)/.test(OAI), "  and passes whatever it was given");
}

console.log("\n9. THE MONEY");
{
  ok(/spendCredits\(session\.accountId, total\)/.test(ROUTE), "charged before any paid call");
  ok(/const total = count \* PFP_COST/.test(ROUTE), "one credit per image");
  // The gate grants free BANNERS. Spending that on an avatar would
  // quietly take from the thing it was promised for.
  // Comments stripped — the route EXPLAINS why the allowance is not
  // used, so searching the raw text finds the explanation.
  ok(!/consumeGeneration|gateStateOf|allowance/.test(bare(ROUTE)), "the holder allowance cannot fund this");
  ok(/CREDITS ONLY, NOT THE HOLDER BUCKET/.test(ROUTE), "  and that is stated, not incidental");
  ok(/refundCredits\(charged\.accountId, charged\.amount\)/.test(ROUTE), "a failed run refunds in full");
  ok(/PARTIAL SUCCESS IS A PARTIAL CHARGE/.test(ROUTE), "and one of two refunds the other");
  ok(/refundCredits\(session\.accountId, missing \* PFP_COST\)/.test(ROUTE), "  by the number actually missing");
  ok(/allSettled/.test(ROUTE), "one failure does not discard the other image");
  ok(/if \(!images\.length\) throw/.test(ROUTE), "  but zero is a real failure");

  ok(/requireUser\(req\)/.test(ROUTE), "identity comes from the signed session");
  ok(/rateLimited\(session\.accountId\)/.test(ROUTE), "rate limited per account");
  ok(/Math\.min\(Math\.max\(parseInt/.test(ROUTE), "count is clamped, not trusted");
  ok(/\/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(rawColor\)/.test(ROUTE), "colour is validated as hex");
  // That string lands inside a prompt. An unbounded field there is
  // somewhere to write instructions.
  // Fragment, not the sentence — it wraps across two comment lines,
  // so matching the whole thing matches nothing.
  ok(/somewhere to write instructions/.test(ROUTE), "  and the reason is recorded");
  ok(/slice\(0, PFP_TEXT_MAX\)/.test(ROUTE), "text is bounded server-side too");
  ok(/ALLOWED_TYPES\.includes\(f\.type\)/.test(ROUTE), "and every upload type is checked");
}

console.log("\n10. THE SOURCE IS NOT SQUARED BEFORE IT IS SENT");
{
  // Squaring here would hand the model a stretched subject and a
  // cropped one — the two things it is being asked to fix. It has to
  // see the real portrait frame, interface and all.
  ok(/fit: "inside"/.test(ROUTE), "the upload keeps its aspect ratio");
  ok(!/fit: "cover"[^]*resize\(1024, 1024/.test(ROUTE.slice(0, ROUTE.indexOf("charge"))), "  nothing crops it first");
  ok(/squaring it here would hand the model a/.test(ROUTE), "and the reason is recorded");
  ok(/resize\(PFP_SIZE, PFP_SIZE, \{ fit: "cover"/.test(ROUTE), "the OUTPUT is squared, after generation");
}

console.log("\n11. FOUR TABS, IN THE ORDER ASKED FOR");
{
  // Scoped to the tab row. "Memes" also appears in the import at the
  // top of the file, so searching the whole page found that instead
  // and reported the order backwards.
  const tabs = PAGE.slice(
    PAGE.indexOf('<div className="surface-tabs"'),
    PAGE.indexOf('{inspiredBy && surface === "dex"')
  );
  ok(tabs.length > 200 && tabs.length < 3000, "the tab row is where it is expected to be");
  const order = ["DEX banners", "PFP maker", "𝕏</span> headers", "Memes"];
  let at = -1;
  for (const label of order) {
    const i = tabs.indexOf(label);
    ok(i > at, "  " + label.replace(/<[^>]*>/g, "") + " comes after the one before it");
    at = i;
  }
  ok(/surface === "pfp"/.test(PAGE), "the pfp surface renders");
  ok(/surface === "memes"/.test(PAGE), "and the memes surface");
  // Two shipped, two not.
  const memeTab = PAGE.slice(PAGE.indexOf('aria-selected={surface === "memes"}'), PAGE.indexOf('aria-selected={surface === "memes"}') + 320);
  ok(/tab-soon/.test(memeTab), "memes is badged Soon");
  const pfpTab = PAGE.slice(PAGE.indexOf('aria-selected={surface === "pfp"}'), PAGE.indexOf('aria-selected={surface === "pfp"}') + 300);
  ok(!/tab-soon/.test(pfpTab), "and the pfp tab is NOT — it actually works");

  // Four pills do not fit a phone. Wrapping to two rows stops them
  // reading as one control.
  ok(/\.surface-tabs \{\s*overflow-x: auto/.test(CSS), "the tab row scrolls on a phone rather than wrapping");
}

console.log("\n11b. TWO STYLES IN ONE RUN");
{
  // Same contract as the banner picker: pick two, get one of each,
  // rather than two of whichever was clicked first.
  const two = M.distributeStyles(["glow", "anime"], 2);
  ok(two.join() === "glow,anime", "two styles across two options is one each, in order");
  ok(M.distributeStyles(["glow"], 2).join() === "glow,glow", "and one style fills both");

  ok(/const perOption = distributeStyles\(/.test(ROUTE), "the route spreads them");
  ok(/perOption\.map\(async \(id\) => \{/.test(ROUTE), "  building a prompt per option, not one for the run");
  ok(/const prompt = buildPfpPrompt\(style\.id/.test(ROUTE), "  from that option's own style");
  ok(/slice\(0, PFP_MAX\)/.test(ROUTE), "capped at the option ceiling");
  ok(/\[\.\.\.new Set\(wanted\)\]/.test(ROUTE), "and deduped");
  ok(/styleName: style\.name/.test(ROUTE), "each image says which style it is");

  // With two styles in one run, an unlabelled pair is a guess.
  ok(/im\.styleName/.test(UI), "and the UI shows it");
  ok(/prev\.length === 1 \? prev :/.test(UI), "the last style cannot be deselected to nothing");
  ok(/if \(next\.length > count\) setCount\(next\.length\)/.test(UI),
     "picking a second style raises the option count rather than refusing");
  ok(/disabled=\{n < styleIds\.length\}/.test(UI), "and the count cannot drop below the styles picked");
}

console.log("\n11c. KEEP THE BACKGROUND");
{
  // A toggle, not a setting — a yes/no about the picture rather than a
  // choice about what to make.
  const kept = M.buildPfpPrompt("default", { keepBg: true });
  ok(/KEEP THE BACKGROUND IT CAME WITH/.test(kept), "the toggle reaches the prompt");
  ok(/Do not invent a new setting/.test(kept), "  and refuses an invented one");
  ok(/extended outward where the square needs more of it/.test(kept), "  extending it for the square crop");
  // The cleanup is NOT what is being kept, and the two are easy to
  // confuse — this is the one sentence that keeps a Follow button.
  ok(/This is not permission to keep the interface/.test(kept), "the interface still goes either way");
  ok(/What survives is the PLACE/.test(kept), "  with the distinction drawn");

  // ══ THE DEFAULT FLIPPED ══
  //
  // Keeping the ground is now the standing behaviour and the toggle
  // asks for the CHANGE. Doing the least to someone's picture is the
  // safe default; replacing what is behind their subject is a real
  // edit and should be something they asked for.
  ok(/KEEP THE BACKGROUND/.test(M.buildPfpPrompt("default")), "KEEPING is now the default");
  ok(/KEEP THE BACKGROUND/.test(M.buildPfpPrompt("glow")), "  on Glow too");
  const replaced = M.buildPfpPrompt("default", { newBg: true });
  ok(/REPLACE THE BACKGROUND/.test(replaced), "and the toggle asks for the replacement");
  ok(!/KEEP THE BACKGROUND/.test(replaced), "  never both at once");
  // Said explicitly rather than by omitting the keep block — silence
  // leaves the model free to keep most of the scene and call it new.
  ok(/not softened, not blurred, not partially kept/.test(replaced), "  and it means a real replacement");
  ok(!/REPLACE THE BACKGROUND/.test(M.buildPfpPrompt("solid", { newBg: true })), "solid gets neither block");
  ok(!/REPLACE THE BACKGROUND/.test(M.buildPfpPrompt("anime", { newBg: true })), "nor anime");
  ok(/newBg && showBgToggle/.test(UI), "the UI sends the change, not the absence of one");
  ok(/<b>Make a new background<\/b>/.test(UI), "and is labelled for what it does");

  // THE LINE IS NOT "does this style touch the background" — it is
  // whether the style is DEFINED by replacing it. Glow is a LIGHTING
  // treatment: you can rim-light a subject standing in a real room and
  // grade that room to match. Solid is a flat field by definition and
  // Anime redraws the whole frame in another medium, so in neither is
  // there an original background left to keep.
  ok(M.getPfpStyle("default").keepBg && M.getPfpStyle("glow").keepBg, "offered on Default and Glow");
  ok(!M.getPfpStyle("solid").keepBg && !M.getPfpStyle("anime").keepBg, "and not on Solid or Anime");
  for (const id of ["solid", "anime"]) {
    ok(!/KEEP THE BACKGROUND/.test(M.buildPfpPrompt(id, { keepBg: true })),
       "  " + id + " ignores it even if asked");
  }
  ok(/KEEP THE BACKGROUND/.test(M.buildPfpPrompt("glow", { keepBg: true })), "  and glow honours it");

  // ══ KEPT IS NOT UNTOUCHED ══
  //
  // The failure is a sharp, lit, treated subject sitting in front of a
  // flat dull rectangle left over from the source. It is instantly
  // obvious because nothing in the world looks like that.
  const g = M.buildPfpPrompt("glow", { keepBg: true });
  ok(/KEPT DOES NOT MEAN UNTOUCHED/.test(g), "the setting is not replaced, but it is not left alone either");
  ok(/Whatever this style does to the subject is done to the whole frame/.test(g), "  the treatment covers the frame");
  ok(/that source exists in the room and the room shows it/.test(g), "  the light spills into the place");
  ok(/ONE PHOTOGRAPH, NOT A SUBJECT PASTED ONTO ITS OWN BACKGROUND/.test(g), "and it must read as one image");
  ok(/one light, one palette and one depth of field/.test(g), "  sharing light, palette and focus");
  // Glow's own treatment asks for a dark plain ground, which would
  // otherwise fight this block three paragraphs later.
  ok(/read that as an instruction about ATTENTION rather than about content/.test(g),
     "and a style asking for a plain ground is reconciled rather than left contradicting");
  ok(/deliberately subordinate, never merely unfinished/.test(g), "  quiet by grading, not by neglect");
  ok(/showBgToggle && \(/.test(UI), "the UI hides it there too");
  ok(/role="switch"/.test(UI), "and it is a real switch");
}

console.log("\n11e. NO CIRCLE, EVER");
{
  // Say "profile picture" to an image model and it draws a round
  // frame — the platform crops the square into a circle afterwards, so
  // a circle in the art becomes a circle inside a circle.
  const p = M.buildPfpPrompt("default");
  ok(/DO NOT DRAW THE CIRCLE/.test(p), "the circle is refused outright");
  ok(/That crop is something the platform does to your square afterwards/.test(p),
     "  with the reason: the crop is not ours to draw");
  ok(/artwork runs to all four edges/.test(p), "and the art fills the square");
  for (const thing of [
    "no round frame", "no ring", "no border", "no outline",
    "circular vignette", "circular mask", "no disc the subject sits inside",
    "no transparent or checkered corners", "no story-ring", "badge or avatar bubble",
  ]) {
    ok(p.includes(thing), "  " + thing);
  }
  ok(/is not an instruction to draw a profile-picture-shaped object/.test(p),
     "and the word itself is disarmed");
  // Every style, not just Default.
  for (const id of ["glow", "solid", "anime"]) {
    ok(/DO NOT DRAW THE CIRCLE/.test(M.buildPfpPrompt(id)), "  " + id + " carries it too");
  }
}

console.log("\n11f. SEVERAL VIEWS OF ONE SUBJECT");
{
  ok(M.PFP_IMAGES_MAX === 5, "up to five images");
  const one = M.buildPfpPrompt("default", { images: 1 });
  ok(!/THERE ARE \d+ IMAGES/.test(one), "no multi block for a single image");
  // A model told to "read them together" while holding one image
  // starts inventing a second.
  const three = M.buildPfpPrompt("default", { images: 3 });
  ok(/THERE ARE 3 IMAGES, AND THEY ARE ALL THE SAME SUBJECT/.test(three), "and the count is stated");
  ok(/build ONE understanding of the subject from all of them/.test(three), "read together, not arranged");
  ok(/Where they disagree, trust the sharpest and most complete view/.test(three), "with a tiebreak");
  // THE FAILURE THIS INVITES is a collage — two heads, or a subject
  // beside a smaller copy of itself.
  ok(/The result contains ONE subject — not two/.test(three), "and one subject comes out");
  ok(/not a grid, not a collage, not a before and after/.test(three), "  no collage");
  ok(/None of them is a style reference\. Every one is the subject\./.test(three),
     "and they are not references, which is the banner's field");

  ok(/form\.getAll\("images"\)/.test(ROUTE), "the route takes several");
  ok(/form\.getAll\("image"\)/.test(ROUTE), "  and still accepts the old singular field");
  ok(/slice\(0, PFP_IMAGES_MAX\)/.test(ROUTE), "capped");
  ok(/images: srcs\.length/.test(ROUTE), "the count reaches the prompt");
  ok(/generatePfp\(prompt, \{ images: srcs/.test(ROUTE), "and all of them reach the model");
  ok(/PFP_IMAGES_MAX - prev\.length/.test(UI), "the UI stops at the cap");
  ok(/Sliced BEFORE the object URLs are made/.test(UI), "  without leaking a URL for the ones it drops");
}

console.log("\n11g. A DIRECTION FIELD, ON DEFAULT ONLY");
{
  const p = M.buildPfpPrompt("default", { wants: "make him look left" });
  ok(/WHAT THE CLIENT ASKED FOR — in their own words/.test(p), "it reaches the prompt");
  ok(/make him look left/.test(p), "  verbatim");
  ok(/where it disagrees with the treatment above, it wins/.test(p), "and outranks the style");
  ok(/It does not override the two rules below/.test(p), "but not the fidelity or framing rules");
  ok(!/WHAT THE CLIENT ASKED FOR/.test(M.buildPfpPrompt("default")), "absent when empty");

  // The other three styles ARE the instruction — a second brief on top
  // of "make it anime" is two directions arguing in one prompt.
  ok(M.getPfpStyle("default").wants === true, "Default takes one");
  for (const id of ["glow", "solid", "anime"]) {
    ok(!M.getPfpStyle(id).wants, "  " + id + " does not");
    ok(!/WHAT THE CLIENT ASKED FOR/.test(M.buildPfpPrompt(id, { wants: "make him look left" })),
       "    and ignores it if sent");
  }
  ok(/slice\(0, PFP_WANTS_MAX\)/.test(ROUTE), "bounded server-side");
  const long = M.buildPfpPrompt("default", { wants: "y".repeat(400) });
  ok(!long.includes("y".repeat(M.PFP_WANTS_MAX + 1)), "and in the builder");
  ok(/showWants && \(/.test(UI), "the UI shows it only where it applies");
}

console.log("\n11h. FIVE SUPPORTING IMAGES ON THE BANNER TOO");
{
  const GEN = read("app/api/generate/route.js");
  const EDIT = read("app/api/edit/route.js");
  const CRED = read("lib/credits.js");
  const LB = read("components/Lightbox.jsx");
  ok(/const MAX_REFS = 5;/.test(GEN) && /const MAX_REFS = 5;/.test(EDIT), "both routes cap at five");
  ok(/getAll\("refs"\)\.slice\(0, MAX_REFS\)/.test(GEN), "generate reads the constant");
  ok(/getAll\("refs"\)\.slice\(0, MAX_REFS\)/.test(EDIT), "  and so does edit");
  ok(/export const MAX_REFS = 5;/.test(CRED), "the client has one number to match");
  ok(!/refImages\.length < 3/.test(PAGE) && /refImages\.length < MAX_REFS/.test(PAGE), "the picker uses it");
  ok(/up to \{MAX_REFS\}/.test(PAGE), "and the label cannot drift from it");
  ok(/refs\.length < MAX_REFS/.test(LB), "the edit viewer too");
  ok(!/slice\(0, 3\)/.test(PAGE) && !/slice\(0, 3\)/.test(LB), "with no hard-coded 3 left behind");
}

console.log("\n11d. THE COPY, AND THE SIZE IT IS SHOWN AT");
{
  // This opened with a paragraph explaining the screenshot handling —
  // the portrait crop, the interface, what gets stripped. That is what
  // the product DOES, not something to read at someone before they
  // have uploaded anything.
  ok(/<h2>PFP maker<\/h2>/.test(UI), "the section is called PFP maker");
  ok(!/TikTok/.test(UI), "the screenshot explainer is gone from the UI");
  ok(!/interface all over it/.test(UI), "  all of it");
  ok(/<p>Square, built around your subject\.<\/p>/.test(UI), "one line in its place");

  // ══ AND THE HINTS SAY THE FIELD, THEN STOP ══
  //
  // A hint that explains the mechanism, justifies the default or
  // teaches the concept is written for us. "Optional" is the whole
  // sentence; examples belong in the placeholder, where they are read
  // at the moment of typing rather than lectured beforehand.
  ok(/<span className="pfp-help">Optional\.<\/span>/.test(UI), "the direction field says Optional and nothing else");
  ok(/placeholder="give it a hoodie, make him look left"/.test(UI), "with two examples, in the placeholder");
  ok(/<span className="pfp-help">Leave it empty for none\.<\/span>/.test(UI), "and text does not explain what a ticker is");
  ok(!/Usually a name or ticker/.test(UI), "  that is gone");
  ok(!/Say it plainly/.test(UI), "  so is the coaching");
  ok(!/More views means a better read of it/.test(UI), "  and the justification for the image cap");
  // It stays in the PROMPT, where it does the work.
  ok(/Expect a phone screenshot/.test(PFP), "while the prompt still does the actual job");

  // A 1024px square in a 280px box on a 390px phone threw away the one
  // thing anyone checks: whether the face survived.
  // Comments stripped: the rule that replaced it QUOTES the old value
  // to explain what was wrong, so searching the raw file finds the
  // explanation and reports the bug still present.
  ok(!/minmax\(220px, 280px\)/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, "")),
     "the results grid no longer caps its track width");
  ok(/\.pfp-out \{\s*display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(CSS),
     "two up, each free to fill its column");
  ok(/\.pfp-out \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(CSS), "and one full-width on a phone");

  // Tap to view. The viewer already exists and already handles a
  // square — reusing it beats a second lightbox.
  // The same filling button the banner run has. A spinner answers "is
  // it working"; this answers how far in you are, which is the thing
  // anyone waiting actually wants.
  ok(/useProgress/.test(UI), "the wait shows progress, not just a spinner");
  ok(/className=\{`btn primary block pfp-go gen-btn\$\{busy \? " is-running" : ""\}`\}/.test(UI),
     "  reusing the banner button's own markup rather than a second one");
  ok(/style=\{\{ "--p": progress \}\}/.test(UI), "  driven by the same variable");
  ok(/<span className="gen-fill" aria-hidden="true" \/>/.test(UI), "  with the fill element present");
  // TDZ: declared above `busy` this builds clean and throws on load.
  ok(UI.indexOf("const progress = useProgress") > UI.indexOf("const [busy, setBusy]"),
     "  and declared after the state it reads");
  ok(/useProgress\(busy, 30_000\)/.test(UI), "at a shorter median than the banner run");

  ok(/import Lightbox from "@\/components\/Lightbox"/.test(UI), "the results open in the shared viewer");
  ok(/className="zoomable"/.test(UI), "  the image is tappable");
  ok(/onClick=\{\(\) =>\s*setZoom\(\{/.test(UI), "  and opens it");
  ok(/<Lightbox item=\{zoom\} onClose/.test(UI), "  which is mounted");
}

console.log("\n12. THE MEMES TEASER");
{
  const MC = read("components/MemesComingSoon.jsx");
  ok(/Coming soon/.test(MC), "badged coming soon");
  for (const f of ["pepe.jpg", "wojak.jpg", "chad.jpg"]) {
    ok(fs.existsSync(R + "public/memes/" + f), "  " + f + " exists");
  }
  ok(/aspect-ratio: 3 \/ 2/.test(CSS), "the cards are 3:2");
  // Static rather than the spotlight feed the X teaser reads: nothing
  // has ever made a meme, so a fallback would show 3:1 banners under a
  // heading promising 3:2 memes.
  ok(!/api\/spotlight/.test(MC), "and they are static, not pulled from the banner feed");
  ok(/useScrollFocus/.test(MC), "with the same scroll-driven entrance as the other stages");
}

console.log("\nX. A FAILED RUN IS WRITTEN DOWN");
{
  // Two PFP runs failed on production and /admin7731 showed nothing,
  // which read as "no failures" and meant "failures we never recorded".
  const P = fs.readFileSync(R + "app/api/pfp/route.js", "utf8").replace(/\r\n/g, "\n");
  const G = fs.readFileSync(R + "app/api/generate/route.js", "utf8").replace(/\r\n/g, "\n");
  const E = fs.readFileSync(R + "app/api/edit/route.js", "utf8").replace(/\r\n/g, "\n");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok(/recordRefusal/.test(strip(P)), "the PFP route records its failures at all — it never did");
  ok(/kind: "pfp"/.test(strip(P)), "tagged as pfp, so the three surfaces are separable");
  // Declared inside the try they are out of scope in the catch, which
  // is precisely when they are needed.
  ok(/let wants = ""/.test(strip(P)) && /let styleIds = \[\]/.test(strip(P)),
     "and what was asked for is hoisted so the catch can still see it");

  // ══ THE BIGGER HALF ══
  //
  // recordRefusal used to sit inside `if (policy)`. Quota, billing, a
  // dead key and a crash wrote nothing anywhere — so the one class of
  // failure that is OUR fault was the one class guaranteed to be
  // invisible on the screen you check when things break.
  for (const [name, src] of [["generate", G], ["edit", E]]) {
    const s = strip(src);
    const calls = s.match(/recordRefusal\(\{[^}]*\}/g) || [];
    ok(calls.length >= 1, `${name} still records refusals`);
    ok(/reason,/.test(s), `${name} passes the REAL reason through, so an outage is distinguishable`);
  }
  ok(!/if \(reason === "policy" && instruction\)/.test(strip(E)),
     "the edit route no longer throws away everything that is not a refusal");

  const A = strip(fs.readFileSync(R + "app/api/admin/refusals/route.js", "utf8"));
  ok(/internal: items\.filter/.test(A), "admin counts the our-fault ones separately");
  // An outage writes one row per attempt with the same cause. Letting
  // those into the ranking buries the real signal exactly when the log
  // fills up.
  ok(/items\.filter\(\(x\) => reasonOf\(x\) === "policy"\)/.test(A),
     "AND THE WORD RANKING READS POLICY ROWS ONLY, so an outage cannot pollute it");
  ok(/i\.reason \|\| "policy"/.test(A), "rows written before `reason` existed still count as refusals");
}

console.log(bad ? "\n" + bad + " FAILED" : "\nall green");
process.exit(bad ? 1 : 0);
