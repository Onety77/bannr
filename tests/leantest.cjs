// leanBrief — the director decides, the renderer draws.
//
// The image model used to be sent the whole of a style's `mood`: how
// to read a brief, what to reject, what a good idea looks like. All of
// it is about WHAT TO MAKE, and by the time the renderer runs that has
// been decided and written down by a text model that reads a brief far
// better than it does. Sending both asked it to re-decide something
// already decided, with less to decide it from — and the measurement
// that started this was a control run falling into the generic-
// futurism trap its OWN ban was written to prevent. A rule that is
// present and still broken is the signature of a prompt with too much
// in it to weigh.
//
// Built with the real modules, so the assertions are about what the
// two models are actually handed.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nTHE DIRECTOR DECIDES, THE RENDERER DRAWS\n");

const load = (file, names, inject = {}) => {
  const src = read(file);
  const keys = Object.keys(inject);
  return new Function(
    ...keys,
    src.replace(/^import[^\n]*$/gm, "")
       .replace(/^export \{ AUTO_ID[^\n]*$/gm, "")
       .replace(/^export /gm, "") + `\nreturn { ${names} };`
  )(...keys.map((k) => inject[k]));
};

const S = load("lib/styles.js", "STYLES, AUTO_ID, AUTO_NAME, distributeStyles");
const T = load("lib/templates.js", "buildPrompt, getTemplate, directorBrief, directorLimits, autoTemplate", {
  STYLES: S.STYLES, AUTO_ID: S.AUTO_ID, AUTO_NAME: S.AUTO_NAME,
  distributeStyles: S.distributeStyles, buildDirection: () => "",
});

const brief = {
  name: "HoodX Finance", ticker: "$HOODX", tagline: "Dividends in stocks.",
  vibe: "tokenised US stocks on-chain — hold real equities and earn dividends",
};
const CONCEPT = "[[CONCEPT]]";
const tek = T.getTemplate("tech");
const lean = T.buildPrompt(tek, brief, "", { concept: CONCEPT });
const full = T.buildPrompt({ ...tek, leanBrief: false }, brief, "", { concept: CONCEPT });

ok(tek.leanBrief === true, "Tek is lean");
ok(lean.length < full.length * 0.75, `the renderer's prompt is much shorter (${full.length} → ${lean.length})`);

/* ---------------- what the renderer stops being told ---------------- */
// Every one of these is about deciding WHAT TO MAKE. The director has
// already decided, and its answer is the concept.
for (const p of [
  "Approach every project as a unique design problem",
  "Treat graphic design as a creative medium",
  "Think like a creative director presenting a concept",
  "ONE IDEA, WHOLLY COMMITTED TO.",
  "BE LITERAL ABOUT WHAT THE PROJECT TOUCHES.",
  "DO NOT ILLUSTRATE THE NAME.",
  "One habit to break: the generic futurism",
  // The briefing goes too: it is the raw material the director worked
  // FROM, and it shouts "THIS IS WHERE THE IDEA COMES FROM" at a
  // renderer holding an idea that already came from it.
  "THIS IS WHERE THE IDEA COMES FROM",
]) {
  ok(!lean.includes(p) && full.includes(p), `out: ${p.slice(0, 46)}`);
}

/* ---------------- and what it must still be told ---------------- */
// These three survive because the director cannot enforce them from a
// text concept: the quality bar, the name being readable, and the ban
// on rendering type as a material — chrome, bevel, extrusion — which
// arrives disguised as polish and which no concept ever asks for.
for (const p of [
  "brand-grade design work",
  "THE PROJECT NAME ALWAYS APPEARS, WHOLE AND LEGIBLE.",
  "disguised as polish",
  "NOT IN THIS PIECE",
  "TEXT SAFE MARGIN",
  CONCEPT,
  "HoodX Finance",
]) {
  ok(lean.includes(p), `kept: ${p.slice(0, 46)}`);
}

// Every paragraph of `render` has to appear verbatim in `mood`, or the
// two copies have drifted and the director and the renderer are being
// told different things about the same rule.
for (const p of tek.render.split("\n\n")) {
  ok(tek.mood.includes(p), `render paragraph still matches mood: ${p.slice(0, 42)}`);
}

/* ---------------- the director gains the job ---------------- */
const db = T.directorBrief(tek);
ok(db.startsWith(tek.mood), "the director still gets the whole mood");
ok(/YOU ARE WRITING THE ONLY BRIEF THE RENDERER WILL GET/.test(db), "plus the fact that its concept IS the brief");
ok(/Around 160 words/.test(db), "and how long that brief should be");
ok(T.directorBrief({ ...tek, leanBrief: false }) === tek.mood, "a non-lean style is unchanged");

/* ---------------- the limits are emitted LAST ---------------- */
// They lived inside the style brief first, mid-message, with the whole
// palette printed after them. Both were ignored on the first real run:
// the mark specified as "a recurring motif" and drawn eight times, and
// a name given as "Honey" written back as "HONEY". Nothing was wrong
// with the wording — a ban buried mid-prose loses to whatever follows.
const limits = T.directorLimits(tek);
ok(/appears ONCE/.test(limits), "the mark may appear once");
ok(/recurring motif/.test(limits), "and the exact phrase that went wrong is refused by name");
ok(/80 pixels/.test(limits), "the margin travels to the director too");
ok(!db.includes(limits), "the limits are NOT inside the style brief");
ok(T.directorLimits({ ...tek, leanBrief: false }) === "", "and a non-lean style gets none");

const OA = bare(read("lib/openai.js"));
{
  const i = OA.indexOf("${mustObey");
  const j = OA.indexOf("Return strict JSON");
  const k = OA.indexOf("${d.palette");
  ok(i > 0 && k > 0 && i > k, "mustObey is printed after the director's own palette");
  ok(i > 0 && j > i, "and immediately before the output instruction");
}
const ROUTE = bare(read("app/api/generate/route.js"));
ok(/mustObey: isDefault \? "" : directorLimits\(tpl\)/.test(ROUTE), "the route passes them");
ok(/styleBrief: isDefault[\s\S]{0,140}directorBrief\(tpl\)/.test(ROUTE), "and the lean-aware style brief");

/* ---------------- Default inherits none of it ---------------- */
// A borrowed template must not bring another style's rendering rules
// into a mode whose entire point is inventing the direction.
const auto = T.autoTemplate();
ok(!("leanBrief" in auto) && !("render" in auto), "autoTemplate strips both halves of the flag");
const autoPrompt = T.buildPrompt(tek, brief, "", { concept: CONCEPT, auto: true });
ok(autoPrompt.includes("No fixed category has been chosen"), "and Default still writes its own direction");

/* ---------------- it cannot strip a style to nothing ---------------- */
const noRender = T.buildPrompt({ ...tek, render: undefined }, brief, "", { concept: CONCEPT });
ok(noRender.includes("ONE IDEA, WHOLLY COMMITTED TO."), "a lean style with no render block falls back to its mood");

// An empty part would otherwise join into a gap that reads as a
// missing section.
ok(!/\n\n\n/.test(lean), "no hole is left where the briefing used to be");

console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
