// The circuit-board ban: it existed twice already and lost anyway.
// This checks the two things that were actually wrong — WHERE it sat
// and HOW it was phrased — by building a real prompt.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const T = read("lib/templates.js");
const O = read("lib/openai.js");

console.log("\n1. THE STYLE DECLARES WHAT IT MAY NOT CONTAIN");
{
  const tech = T.slice(T.indexOf('id: "tech"'), T.indexOf('id: "meme"'));
  ok(/forbid: \[/.test(tech), "Tek has a forbid list");
  const items = (tech.match(/^\s{6}"[^"]+",$/gm) || []);
  ok(items.length >= 3, "with " + items.length + " entries");
  const all = items.join(" ").toLowerCase();
  for (const noun of ["circuit board", "pcb", "hexagon grid", "binary", "floating code", "particle"]) {
    ok(all.includes(noun), "  names " + noun);
  }
  // The grammar that works: nouns, no reasoning, no softener. The
  // version that failed ended "none of them is necessary".
  ok(!/if the concept|necessary|try to avoid|where possible|generally/i.test(all),
     "and reads as a list, not as advice");
}

console.log("\n2. IT IS EMITTED WHERE THE MODEL WEIGHTS IT");
{
  // Build a real prompt rather than reading for the string. Position
  // is the entire fix: the old ban sat a third of the way in, with the
  // concept, the client's direction and the framing all after it.
  // templates.js re-exports from styles.js and advanced.js, so those
  // are inlined the same way rather than stubbed — a fake
  // buildDirection would hide it if the real one started emitting
  // something that changed the ordering this test is about.
  const styles = read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "");
  const advanced = read("lib/advanced.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "");
  const src = T
    .replace(/^import[^\n]*$/gm, "")
    .replace(/^export \{[^}]*\};$/gm, "")
    .replace(/^export /gm, "");
  const M = new Function(styles + "\n" + advanced + "\n" + src + "\nreturn { buildPrompt, getTemplate, STYLES };")();

  const tpl = M.getTemplate("tech");
  ok(Boolean(tpl?.forbid?.length), "getTemplate carries it through");

  const prompt = M.buildPrompt(tpl, { name: "Uniswap Retro", ticker: "$UNI", vibe: "the first test token" }, "", { concept: "A dense technical substrate fills the frame." });

  const at = prompt.indexOf("NOT IN THIS PIECE");
  ok(at > 0, "the block is in the prompt");
  ok(at > prompt.indexOf("THE CONCEPT FOR THIS PIECE"), "AFTER the concept, so it can overrule one that drifted");
  ok(at > prompt.length * 0.5, "in the back half of the prompt (" + Math.round((at / prompt.length) * 100) + "%)");
  ok(prompt.includes("These are not discouraged, they are excluded."), "and says so without hedging");
  ok(prompt.toLowerCase().includes("circuit board"), "circuit boards named explicitly");

  // The client still wins. Someone who asks for a circuit board gets
  // one — that was the original rule and it must survive this.
  const withWant = M.buildPrompt(tpl, { name: "Uniswap Retro", ticker: "$UNI", direction: "put it on a circuit board" }, "", { concept: "Type as artwork." });
  const forbidAt = withWant.indexOf("NOT IN THIS PIECE");
  const clientAt = withWant.indexOf("WHAT THE CLIENT ASKED FOR");
  ok(clientAt > forbidAt, "the client's own words land AFTER the ban, so they still win");
  ok(withWant.includes("this wins"), "and the block says so explicitly");

  // A style with no list emits nothing at all.
  const meme = M.buildPrompt(M.getTemplate("meme"), { name: "X" }, "", {});
  ok(!meme.includes("NOT IN THIS PIECE"), "a style with no forbid list emits no empty block");
}

console.log("\n2a. TEXT KEEPS AWAY FROM THE EDGES");
{
  // "Comfortably inboard of all four edges" is a feeling, not a
  // number — 1% from the edge satisfies it, and that is what kept
  // coming back. A measurement cannot be interpreted generously.
  ok(/no part of any letter may come within 80 pixels of the left or right edge/.test(T),
     "the margin is a number, not an adjective");
  ok(/within 45 pixels of the top or bottom/.test(T), "top and bottom too");
  ok(/Not the bounding box — the ink itself/.test(T), "measured on the ink");

  // The whole risk of this change is over-correction: a rule about
  // distance being read as a rule about placement.
  ok(/THIS SAYS NOTHING ABOUT WHERE THE TEXT GOES/.test(T), "and it says outright that placement is untouched");
  ok(/Do not read it as a preference for centred type/.test(T), "naming the misreading to avoid");
  ok(/or for text at all/.test(T), "including that a banner may still carry none");
  ok(/It does NOT apply to the artwork/.test(T), "the art still bleeds to all four edges");

  // Position: FRAMING is technical and lands last, after the client's
  // own words, which is exactly where a hard constraint belongs.
  const styles = read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "");
  const advanced = read("lib/advanced.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "");
  const src = T.replace(/^import[^\n]*$/gm, "").replace(/^export \{[^}]*\};$/gm, "").replace(/^export /gm, "");
  const M = new Function(styles + "\n" + advanced + "\n" + src + "\nreturn { buildPrompt, getTemplate };")();

  const p = M.buildPrompt(
    M.getTemplate("tech"),
    { name: "Maximus", ticker: "$MAX", direction: "put the name hard against the right edge" },
    "", { concept: "Type as artwork." }
  );
  const marginAt = p.indexOf("TEXT SAFE MARGIN");
  ok(marginAt > 0, "it reaches the prompt");
  ok(marginAt > p.indexOf("WHAT THE CLIENT ASKED FOR"),
     "AFTER the client's own words — technical floor, creative direction above it");
  ok(marginAt > p.length * 0.75, "in the last quarter of the prompt (" + Math.round((marginAt / p.length) * 100) + "%)");
  ok(p.includes("technical constraints, not creative ones"), "and declared as technical");

  // Edits inherit it, or a revision would undo the margin the
  // original respected.
  ok((T.match(/FRAMING,?\n/g) || []).length >= 1 && T.includes("    FRAMING,"), "the edit prompt carries it too");
}

console.log("\n2b. GLOW IS SOFT, NOT A LINE");
{
  const glow = T.slice(T.indexOf('id: "glow"'), T.indexOf('id: "anime"'));

  // Chasing "not a neon outline" this brief was written into a THIN
  // CRISP RIM, and it even banned bloom — which is the falloff that
  // makes a glow a glow. It produced a hard light line.
  ok(!/A thin bright rim/.test(glow), "the 'thin bright rim' framing is gone");
  ok(!/Not bloom\./.test(glow), "and bloom is no longer banned outright");
  ok(/IT IS SOFT, and this is the single decision/.test(glow), "softness is the headline decision");
  ok(/The band has no hard boundary anywhere/.test(glow), "no hard boundary");
  ok(/falls away into the form over a short distance/.test(glow), "falloff INTO the form");
  ok(/carries a little into the air just beyond the edge/.test(glow), "and a little past the edge");
  ok(/meet without a seam/.test(glow), "so light and background do not meet at a line");
  ok(/If you could trace where it stops with a pen/.test(glow), "with a test anyone can apply");
  ok(/Thin, crisp and even is a sticker; soft, gathered and uneven is light/.test(glow),
     "and the two named side by side");

  // The guards that were RIGHT must survive — soft must not become
  // "a haze over everything".
  ok(/not haze filling the air across the frame/.test(glow), "haze across the frame still out");
  ok(/floating around the subject as a separate shape with a gap between/.test(glow), "a detached halo still out");
  ok(/Not a bright sky or a sun doing the work/.test(glow), "a bright background still out");
  ok(/Soft does not mean large/.test(glow), "and soft is explicitly not a licence for size");
  ok(/If the picture looks lit up, it has failed/.test(glow), "restraint intact");
  ok(/It is uneven/.test(glow), "and unevenness intact");

  // The card copy.
  ok(/tagline: "Backlit\. The edge does the work\."/.test(glow), "the tagline says the technique");
  ok(!/Light on the edge, not over it/.test(T + read("lib/styles.js")), "and the old one is gone from both files");
  {
    const S = read("lib/styles.js");
    const lens = [...S.matchAll(/tagline: "([^"]+)"/g)].map((m) => m[1].length);
    const glowLen = "Backlit. The edge does the work.".length;
    ok(glowLen >= Math.min(...lens) && glowLen <= Math.max(...lens),
       "and sits inside the set's length range (" + glowLen + " vs " + Math.min(...lens) + "-" + Math.max(...lens) + ")");
  }
}

console.log("\n3. AND THE CONCEPT WRITER CANNOT PROPOSE ONE");
{
  const design = O.slice(O.indexOf("  design: {"), O.indexOf("  meme: {"));
  ok(/ALSO FORBIDDEN, and this list is not negotiable/.test(design), "the director's ban is unhedged");
  ok(/circuit boards, circuit traces or PCB patterns in any role/.test(design), "and covers every role, not just backgrounds");
  ok(/A CRYPTO OR INFRASTRUCTURE PROJECT IS NOT A LICENCE/.test(design),
     "with the brief that attracts it called out by name");
  ok(/could be described as "a technical-looking surface", you have not had an idea/.test(design),
     "and a test the writer can apply to its own concept");
}

console.log("\n3a. HIM CAN SEE THE SUBJECT NOW");
{
  const him = O.slice(O.indexOf("  him: {"), O.indexOf("  collectibles: {"));
  ok(/vision: true/.test(him), "the HIM director is given the image");
  // Every instruction in it was already about a property of the
  // subject — written blind, all of that was inferred from a name.
  ok(/Look at it before deciding anything/.test(him), "and told to look at it before deciding");
  ok(/A name gives you the noun and nothing about the bearing/.test(him), "with why the name was never enough");
  // ── the literalism trap ──
  // "Derive the ground from the material you actually see" read as
  // "continue the backdrop", and every concept became an extension of
  // whatever room the subject was photographed in.
  ok(!/derive the ground from that/.test(him), "the line that caused it is gone");
  ok(/TELLS YOU WHAT THIS IS — NEVER WHERE IT GOES/.test(him), "the two jobs are separated explicitly");
  ok(/WHATEVER IS BEHIND IT IN THAT IMAGE IS NOT PART OF THE BRIEF/.test(him), "the backdrop is ruled out by name");
  ok(/is a cat; it is not a sofa brief/.test(him), "with a concrete example of the mistake");
  ok(/Extending the backdrop you were shown is not direction, it is tracing/.test(him), "and it is named as a failure");
  ok(/THE ENVIRONMENT IS YOURS TO INVENT, and inventing it is the job/.test(him), "invention is restated as the job");
  ok(/make the invention sharper, not smaller/.test(him), "which is what seeing was FOR");
  ok(/never from what happens to be behind it/.test(him), "the ground comes from material, not backdrop");
  ok(/That is a leap FROM its material TO a world, and the leap is the work/.test(him), "and the leap is named as the work");

  // The moves it stopped reaching for, listed so "direct it" is a
  // list rather than a hope.
  for (const lever of ["THE CROP ITSELF", "in to the eyes alone", "rimmed from behind", "out of focus", "ATMOSPHERE", "EMPTINESS"]) {
    ok(him.includes(lever), "  lever: " + JSON.stringify(lever));
  }
  ok(/A concept that names none of them has described a picture rather than directed one/.test(him),
     "and a concept using none of them is called out as description");
  ok(/not the place it was photographed/.test(him), "the closing instruction says it once more");

  // ── cinematic, defined so it cannot become a filter ──
  ok(/IT IS A FRAME FROM A FILM, NOT AN ILLUSTRATION OF A CHARACTER/.test(him), "it is directed as a film still");
  ok(/caught mid-moment rather than posed/.test(him), "a moment rather than a pose");
  ok(/CINEMATIC IS A CRAFT, NOT A FILTER/.test(him), "and cinematic is defined rather than invoked");
  ok(/long focal length, one motivated source, real falloff/.test(him), "as lens, light and moment");
  ok(/NOT teal-and-orange grading, lens flares, letterbox bars/.test(him),
     "with the clichés it collapses into named and banned");
  ok(/would still read as a film still in flat grey light/.test(him),
     "and a test it can apply: does it hold without the grade");

  // The image prompt has to say it too — the concept steers, but the
  // renderer is what actually draws.
  const T2 = read("lib/templates.js");
  const himMood = T2.slice(T2.indexOf('id: "him"'), T2.indexOf('id: "glow"'));
  ok(/FRAME FROM A FILM/.test(himMood), "the style brief says it as well");
  ok(/Cinematic is a craft, not a filter/.test(himMood), "including the same warning");
  ok(/teal-and-orange grading, lens flares, letterbox bars/.test(himMood), "and the same list of what it is not");
  ok(/DO NOT DESCRIBE IT BACK/.test(him),
     "and it must not spend its words re-describing an image the renderer already has");

  // The reverse of this is one flag, which matters because it is
  // meant to be judged side by side and reverted if it is worse.
  ok(/ONE FLAG\. Set this to false and everything reverts/.test(him), "reverting is one line, and says so");

  // The blind directors stay blind, and design says why.
  const design = O.slice(O.indexOf("  design: {"), O.indexOf("  meme: {"));
  ok(!/vision: true/.test(design), "design is still deliberately blind");
  ok(/YOU HAVE NOT SEEN THE LOGO, AND THAT IS DELIBERATE/.test(design), "  …and still explains why");
  {
    // Vision is opted into per director so that if it turns out to
    // help we know WHICH change did what. This count is the guard
    // against it quietly spreading — raise it deliberately or not at
    // all. pov joined because it cannot work blind: whether a subject
    // has a back to shoot is unanswerable from a name.
    const on = [...O.matchAll(/^  ([a-z]+): \{\n(?:\s*\/\/[^\n]*\n)*\s*vision: true/gm)].map((m) => m[1]);
    ok(on.length === 3 && on.includes("default") && on.includes("him") && on.includes("pov"),
       "exactly three directors see the image: " + on.join(", "));
  }
}

console.log("\n4. THE OTHER BAN THAT ALREADY HOLDS IS UNTOUCHED");
{
  const tech = T.slice(T.indexOf('id: "tech"'), T.indexOf('id: "meme"'));
  // The metallic-type paragraph is the one that worked, and it is the
  // grammar the new block copies. Breaking it while fixing this would
  // be a poor trade.
  for (const s of ["No metallic, chrome, gold", "No bevel, emboss", "No extruded three-dimensional letters"]) {
    ok(tech.includes(s), "type ban intact: " + JSON.stringify(s));
  }
  ok(tech.includes("If the client has explicitly asked for metallic or dimensional lettering, give it to them"),
     "including its own escape hatch for the client");
}

console.log("\nX. THE STYLE REFERENCES POINT THE RIGHT WAY");
{
  // ══ THIS ONE COST SIXTEEN UNUSABLE BANNERS ══
  //
  // The block forbade copying a reference's "layout, composition,
  // subject matter, colour palette, LIGHTING, overall darkness or
  // brightness, mood, typeface" and said a banner resembling one "in
  // any of those respects has failed" — then asked, in the abstract,
  // for "the STANDARD".
  //
  // Every file in references/tech is flat, light, restrained and
  // typographic. So the instruction read as: do not be restrained, do
  // not be light, do not be typographic. Sixteen banners came back
  // dark, ornate and maximalist, and Tek — the only style WITH
  // references — was the worst style in the product. The model was
  // obeying.
  // Comments stripped, because the code above the block explains the
  // old wording by quoting it — and matching that comment instead of
  // the code is the failure mode this suite keeps rediscovering.
  const b = fs.readFileSync(R + "lib/openai.js", "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok(!/in any of those respects has failed/.test(b),
     "resembling a reference is no longer declared a failure");
  ok(!/colour palette, LIGHTING, overall darkness or brightness, mood/.test(b),
     "AND THE FORBIDDEN LIST NO LONGER COVERS THE THINGS A REFERENCE EXISTS TO TRANSMIT");
  // What must still never be lifted is the CONTENT. That fear was
  // real; it was the scope that was wrong.
  ok(/NOTHING \$\{one \? "IT DEPICTS" : "THEY DEPICT"\} belongs in your banner/.test(b),
     "the subject matter is still forbidden");
  ok(/not any word, wordmark or logo/.test(b), "and so are their words and logos");
  ok(/TAKE HOW/.test(b) && /restraint/.test(b),
     "while the design decisions are now explicitly asked for");

  // The director wrote the concept BEFORE the renderer sees anything,
  // so an ornate brass door has to be stopped there too.
  ok(/A NAME IS NOT A SUBJECT/.test(b), "the director is told a name is not a subject");
  ok(!/or from what it is named after/.test(b),
     "and the licence that permitted illustrating the name is gone");
  ok(/THE GROUND IS ONE THING AND IT IS QUIET/.test(b), "and every concept must name a quiet ground");
}

console.log("\nY. TEK BANS WHAT ACTUALLY CAME BACK");
{
  // Scoped here rather than reusing the `tech` from the block at the
  // top of the file, which is local to it.
  const tech = T.slice(T.indexOf('id: "tech"'), T.indexOf('id: "meme"'));
  // The old list banned circuitry and sci-fi UI, so the clichés simply
  // moved next door: brass doors, cogs, keys, honeycomb, cityscapes.
  for (const s of [
    "ornate machinery, gears, cogs",
    "keys, padlocks, chains, safes, vaults",
    "elaborate 3D-rendered scenes",
    "what the project's NAME literally means",
  ]) ok(tech.includes(s), `forbidden: ${s}`);

  for (const s of [
    "THE GROUND IS ONE THING, AND IT IS QUIET",
    "THIS IS DESIGN, NOT A RENDER",
    "DO NOT ILLUSTRATE THE NAME",
  ]) ok(tech.includes(s), `the mood states it too: ${s}`);

  // Flat imperatives hold; reasoning that trails off into "none of
  // them is necessary" reads as advice and is ignored. Every new rule
  // is a command.
  ok(/THE GROUND IS ONE THING, AND IT IS QUIET\.[^]{0,80}A flat colour\./.test(tech),
     "and states it as an imperative rather than as an explanation");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
