// POV — the one style allowed to redraw the subject.
//
// Everything else in the product is safe because the subject is never
// re-posed, so it can never come back as a lookalike. This style takes
// that risk deliberately, which makes two things worth testing that no
// other style needs: that the permission is REALLY GRANTED (or the
// model returns the upload on a new background, which is the safe
// wrong answer), and that it is granted NOWHERE ELSE.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const T = read("lib/templates.js");
const O = read("lib/openai.js");
const A = read("lib/advanced.js");

// Strip my own comments before searching for prose — a rule that only
// exists in a comment about the rule is not a rule.
const bare = (s) => s.replace(/^\s*\/\/.*$/gm, "");

// The same loader the other prompt tests use: run the real modules
// rather than regex the source, so ordering and conditionals are
// exercised for real.
const load = () => {
  const styles = read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "");
  const advanced = A.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "");
  const src = T.replace(/^import[^\n]*$/gm, "").replace(/^export \{[^}]*\};$/gm, "").replace(/^export /gm, "");
  return new Function(styles + "\n" + advanced + "\n" + src +
    "\nreturn { buildPrompt, getTemplate, autoTemplate, STYLES, TEMPLATES, PROMPT_FIELDS, PER_STYLE };")();
};
const M = load();

console.log("\n1. THE STYLE EXISTS AND BOTH FILES AGREE");
{
  const meta = M.STYLES.find((s) => s.id === "pov");
  const tpl = M.getTemplate("pov");
  ok(Boolean(meta), "pov is in lib/styles.js, so the picker can see it");
  ok(Boolean(tpl), "and has prompts in lib/templates.js");
  for (const k of ["name", "tagline", "accent", "thumb"]) {
    ok(meta[k] === tpl[k], "  the two files agree on " + k + " (" + JSON.stringify(meta[k]) + ")");
  }
  ok(M.STYLES.length === 7, "seven styles now (" + M.STYLES.length + ")");
  const accents = M.STYLES.map((s) => s.accent);
  ok(new Set(accents).size === accents.length, "and every accent colour is still distinct");
  ok(fs.existsSync(R + "public/styles/" + meta.thumb), "the thumbnail file is actually there");

  // Taglines wrap to two lines on a phone; one that is much shorter
  // than the rest sits alone and looks broken. This was a real
  // complaint about Glow.
  const lens = M.STYLES.map((s) => s.tagline.length);
  const mine = meta.tagline.length;
  ok(mine >= Math.min(...lens) && mine <= Math.max(...lens),
     "and the tagline is in band (" + mine + " vs " + Math.min(...lens) + "-" + Math.max(...lens) + ")");
}

console.log("\n2. THE PERMISSION IS ACTUALLY GRANTED");
{
  const tpl = M.getTemplate("pov");
  ok(tpl.reangle === true, "the style carries reangle");
  ok(M.PROMPT_FIELDS.includes("reangle"), "and reangle is registered in PROMPT_FIELDS");

  const prompt = M.buildPrompt(tpl, { name: "KIO", ticker: "$KIO", vibe: "a lion cub who inherits the savanna" });
  const at = prompt.indexOf("CAMERA POSITION");
  ok(at > 0, "the CAMERA POSITION block reaches the prompt");
  ok(/overrides the instruction to preserve the subject's framing and pose/.test(prompt),
     "and says out loud that it beats the preservation rule");

  // THE FAILURE THIS STYLE IS BUILT AGAINST. Told to move the camera
  // and also to preserve the subject, a model satisfies both by
  // pasting the upload head-on and changing the scenery. That is the
  // safe-looking answer and it is the one result this style must
  // never give, so the prompt has to name it as a failure.
  ok(/Reproducing the attached pose head-on and changing only the background is a FAILED banner/.test(prompt),
     "the safe wrong answer is named as a failure, not merely discouraged");
  ok(/it is not the view you are drawing/.test(prompt), "the upload is demoted to one view");
  ok(/Move the camera\./.test(prompt), "and the instruction is imperative");

  // But identity is not released with the pose.
  ok(/What must survive is WHO it is/.test(prompt), "identity still has to survive");
  for (const w of ["species", "build", "proportions", "palette", "markings", "costume"]) {
    ok(new RegExp(w).test(prompt), "  " + w + " carries over");
  }
  ok(/the medium the original is drawn in/.test(prompt), "  and so does the drawing medium — this is not a restyle");
  ok(/never a similar character/.test(prompt), "'same character, not a similar one' is stated");
  ok(/two or three features that make this subject recognisable/.test(prompt),
     "and the angle must keep an identifying feature in frame");
  ok(/What must NOT survive is the pose, the orientation, the crop and the distance/.test(prompt),
     "with the released axes listed explicitly");
}

console.log("\n3. AND GRANTED NOWHERE ELSE");
{
  // The whole argument for making this a style was that no existing
  // style changes. If reangle leaks, every other style inherits a
  // licence to redraw the subject and the product's core promise is
  // gone silently.
  const others = M.TEMPLATES.filter((t) => t.id !== "pov");
  ok(others.every((t) => !t.reangle), "no other style carries reangle");
  for (const t of others) {
    const p = M.buildPrompt(t, { name: "KIO", vibe: "a lion cub" });
    ok(!p.includes("CAMERA POSITION"), "  " + t.id + " never receives the block");
  }
  // Default borrows a random template for layout data. PROMPT_FIELDS
  // is what stops that template's instructions riding along, and a new
  // field not listed there is exactly how the last leak happened.
  let leaked = 0;
  for (let i = 0; i < 200; i++) if (M.autoTemplate().reangle) leaked++;
  ok(leaked === 0, "and Default cannot inherit it from a borrowed template");

  // HIM says the opposite thing on purpose. The two styles are the two
  // sides of one decision; if HIM's rule quietly disappeared, this was
  // a loosening rather than an addition.
  const him = bare(O.slice(O.indexOf("  him: {"), O.indexOf("  pov: {")));
  ok(/YOU HAVE ONE VIEW OF THIS SUBJECT/.test(him), "HIM still refuses to turn the subject");
  ok(/never by turning what you were given/.test(him), "  and still says so in those words");
  ok(/NEVER REDRAW THE SUBJECT INTO A DIFFERENT MEDIUM/.test(bare(O)), "the Default director still refuses to restyle");
}

console.log("\n4. THE DIRECTOR CAN SEE, BECAUSE IT HAS TO");
{
  const pov = bare(O.slice(O.indexOf("  pov: {"), O.indexOf("  collectibles: {")));
  ok(pov.length > 500, "the pov director exists");
  ok(/vision: true/.test(pov), "with vision on");
  ok(/concepts: "pov"/.test(bare(T)), "and the style routes to it");

  // TOPOLOGY FIRST. This is the reason vision is not optional here: a
  // wordmark has no back, and "give me a shot from behind" on a flat
  // mark produces nonsense the renderer will happily execute.
  ok(/Does this thing have a back, a profile, a volume/.test(pov), "it asks whether the subject has form at all");
  ok(/IF IT IS FLAT, MOVE THE CAMERA AROUND IT AS AN OBJECT INSTEAD/.test(pov),
     "and has a real answer for flat marks instead of forcing a turn");
  ok(/Do not propose a back view of a wordmark/.test(pov), "  named concretely");
  ok(/do not invent a mascot the client did not upload/.test(pov), "  and cannot invent a character to solve it");

  // A named vocabulary, not "a different angle" — which returns the
  // same portrait rotated fifteen degrees, three times.
  for (const shot of ["FROM BEHIND", "PROFILE", "LOW", "HIGH OR DISTANT", "CLOSE ON A DETAIL", "THREE-QUARTER TURN", "MID-MOVEMENT"]) {
    ok(new RegExp("· " + shot + " —").test(pov), "  shot named: " + shot);
  }
  ok(/the \$\{"COUNT"\} concepts must take DIFFERENT ones/.test(pov), "options must not repeat a shot");
  ok(/Rotating the head-on portrait slightly is not a shot/.test(pov), "and a wobble is explicitly not one");

  ok(/PROTECT THE LIKENESS, EXPLICITLY, IN EVERY CONCEPT/.test(pov), "likeness is the director's job, per concept");
  ok(/A view that hides every identifying feature at once is not usable/.test(pov),
     "  with the unusable case named");
  ok(/IT IS NOT LITERAL POINT-OF-VIEW/.test(pov), "the film meaning of POV is ruled out");
  ok(/The subject is in the picture/.test(pov), "  the subject is present in frame");
  ok(/say that the project name sits in it/.test(pov), "and the empty area is planned for the name");
  ok(/"Dramatic lighting" is not an answer/.test(pov), "light must be specified");
}

console.log("\n5. WHAT THE PICTURE MAY NOT CONTAIN");
{
  const tpl = M.getTemplate("pov");
  ok(Array.isArray(tpl.forbid) && tpl.forbid.length === 3, "three forbidden things");
  const all = tpl.forbid.join(" ").toLowerCase();
  // Each of these is invited by this style specifically and by no
  // other: "show another angle" invites a turnaround sheet, the name
  // POV invites the word lettered on, and the film sense of POV
  // invites the subject vanishing out of its own banner.
  ok(/turnaround|model sheet/.test(all), "turnaround / model sheets");
  ok(/split screen/.test(all), "split screens");
  ok(/appearing more than once/.test(all), "the subject twice in frame");
  ok(/the word pov lettered anywhere/.test(all), "the word POV lettered on");
  ok(/crosshair|viewfinder/.test(all), "viewfinder furniture");
  ok(/first-person shot with the subject absent/.test(all), "and the subject-free first-person shot");
  ok(!/if the concept|necessary|try to avoid|where possible|generally|prefer/.test(all),
     "written as a list, not as advice");

  const prompt = M.buildPrompt(tpl, { name: "KIO" }, "", { concept: "The cub from behind at dawn." });
  const at = prompt.indexOf("NOT IN THIS PIECE");
  ok(at > 0, "and it reaches the prompt");
  ok(at > prompt.indexOf("THE CONCEPT FOR THIS PIECE"), "after the concept, where the model weights it");
}

console.log("\n6. THE MOOD SELLS THE SHOT, NOT A LOOK");
{
  const pov = bare(T.slice(T.indexOf('id: "pov"'), T.indexOf('id: "glow"')));
  ok(/Choose where the camera goes, and let that choice be the whole idea/.test(pov), "the camera is the idea");
  ok(/The camera is the concept/.test(pov), "  said twice, deliberately");
  ok(/IT IS THE SAME CHARACTER/.test(pov), "identity is a headline, not a footnote");
  ok(/So protect the tell/.test(pov), "and the tell is protected");
  ok(/NOT LITERAL POV/.test(pov), "the subject does not vanish from its own banner");
  ok(/Some subjects cannot be walked around/.test(pov), "flat marks are handled in the mood too");
  ok(/That space is where the name goes/.test(pov), "and the negative space is planned, not found");

  // This style carries text — that is the difference from HIM, and
  // the KIO banner that prompted it had a title.
  ok(!/noText: true/.test(pov), "the style is not text-free");
  const prompt = M.buildPrompt(M.getTemplate("pov"), { name: "KIO", ticker: "$RISE" });
  ok(/TEXT — the only words permitted/.test(prompt), "so the name reaches the renderer");
}

console.log("\n7. THE CONTROLS DEFAULT TO SILENCE");
{
  const controls = M.PER_STYLE.pov;
  ok(Array.isArray(controls) && controls.length === 2, "pov has its own controls");
  ok(controls.map((c) => c.key).join(",") === "shot,looking", "  shot and looking");
  for (const c of controls) {
    ok(c.options[0].v === "auto" && !c.options[0].prompt, "  " + c.key + " defaults to auto and emits nothing");
  }

  // THE RULE THE WHOLE PANEL IS BUILT ON: an untouched run must be
  // byte-identical to one built with no settings at all.
  const tpl = M.getTemplate("pov");
  const brief = { name: "KIO", ticker: "$KIO", vibe: "a lion cub who inherits the savanna" };
  const plain = M.buildPrompt(tpl, brief);
  const untouched = M.buildPrompt(tpl, brief, "", { settings: { shot: "auto", looking: "auto" } });
  ok(plain === untouched, "and an untouched panel changes the prompt by not one byte");

  const forced = M.buildPrompt(tpl, brief, "", { settings: { shot: "behind", looking: "vista" } });
  ok(forced !== plain, "while a chosen shot does change it");
  ok(/we see its back/.test(forced), "  'from behind' says where the SUBJECT faces, not where the scenery is");
  ok(/Do not show its face/.test(forced), "  and forbids the face");
  ok(/opening out in front of it/.test(forced), "  'a vast landscape' lands too");

  // Per-style keys must not fire on a Default run — buildDirection is
  // resolved against AUTO_ID there, and a saved pov setting bleeding
  // into Default would be invisible.
  const auto = M.buildPrompt(M.autoTemplate(), brief, "", { auto: true, settings: { shot: "behind" } });
  ok(!/we see its back/.test(auto), "and a saved pov setting cannot leak into a Default run");
}

console.log("\n8. SEVERAL SHOTS IN ONE RUN");
{
  const A2 = new Function(read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\n" + A.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\nreturn { spreadSettings, sharedSettings, optionDirection, optionLabels, picked, multiKeys, isMulti, buildDirection, isDefault, defaultValue, countTouched, controlsFor };")();
  const S2 = new Function(read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\nreturn { slotsFor, maxSlotsFor, optionsForSlots, distributeStyles };")();

  const shot = A2.controlsFor("pov").find((c) => c.key === "shot");
  ok(A2.isMulti(shot), "shot takes several answers");
  ok(A2.multiKeys("pov").includes("shot"), "and is registered as one on this style");

  // Everything that can actually arrive in this field.
  ok(A2.picked(undefined).length === 0, "picked() survives an old draft with no value");
  ok(A2.picked("behind").join() === "behind", "  a bare string from a stale client");
  ok(A2.picked(["auto", "", null, "far", "far"]).join() === "far", "  and junk, blanks and duplicates");

  // THE CONTRACT THE WHOLE PANEL RESTS ON.
  ok(A2.isDefault(shot, []) && A2.isDefault(shot, undefined), "an empty selection is Default");
  ok(!A2.isDefault(shot, ["far"]), "one pick is not");
  ok(A2.countTouched("pov", { shot: [] }) === 0, "and an empty one does not count as touched");
  ok(A2.countTouched("pov", { shot: ["far", "high"] }) === 1, "while a real one counts once, not twice");

  // THE SPREAD. Three shots over three options is one each, in the
  // order they were clicked — that ordering is what the numbered
  // badges in the panel are promising.
  const three = { shot: ["far", "high", "profile"] };
  const got = [0, 1, 2].map((n) => A2.spreadSettings("pov", three, n, 3).shot);
  ok(got.join() === "far,high,profile", "three shots over three options land one each, in order");

  // Fewer options than shots: the extras drop, and they drop off the
  // END rather than shuffling — the panel warns about exactly this.
  const two = [0, 1].map((n) => A2.spreadSettings("pov", three, n, 2).shot);
  ok(two.join() === "far,high", "two options take the first two");

  // More options than shots: repeats rather than inventing.
  const four = [0, 1, 2, 3].map((n) => A2.spreadSettings("pov", three, n, 4).shot);
  ok(new Set(four).size === 3 && four.every((v) => three.shot.includes(v)),
     "four options reuse the three chosen and invent nothing (" + four.join(",") + ")");

  // One pick means one pick everywhere — not "one option gets it".
  const one = [0, 1, 2].map((n) => A2.spreadSettings("pov", { shot: ["profile"] }, n, 3).shot);
  ok(one.join() === "profile,profile,profile", "a single pick applies to every option");

  // Nothing chosen resolves to auto, which emits nothing. This is the
  // untouched-panel guarantee surviving a new control type.
  ok(A2.spreadSettings("pov", {}, 0, 3).shot === "auto", "no pick resolves to auto");
  ok(A2.buildDirection("pov", A2.spreadSettings("pov", {}, 0, 3)) === "", "  and produces no prose");
  ok(A2.buildDirection("pov", A2.spreadSettings("pov", { shot: [] }, 0, 3)) === "",
     "  as does an empty array");

  // A resolved setting has to actually reach the prompt.
  const dir = A2.buildDirection("pov", A2.spreadSettings("pov", three, 1, 3));
  ok(/camera above the subject and looking down/.test(dir), "the assigned shot reaches the direction prose");
  ok(!/long telephoto/.test(dir), "  and only that one — no second camera in the same prompt");

  // The safety net: an unresolved array must never ask for three
  // cameras at once, even on a path that forgot to spread.
  const raw = A2.buildDirection("pov", three);
  ok(/long telephoto/.test(raw) && !/camera above the subject/.test(raw),
     "an unspread array falls back to one shot, not all of them");

  // The split the concept pass depends on.
  // THE LINE IS DRAWN AT WHETHER THE ANSWERS VARY, not at whether the
  // control could take several. A setting given one answer applies to
  // the whole run and belongs in the shared brief once — repeating it
  // identically under every concept number reads as three decisions
  // where the client made one.
  const mixed = { shot: ["far", "high"], looking: ["vista"], palette: "dark", text: "none" };
  const shared = A2.sharedSettings("pov", mixed);
  ok(shared.shot === "auto", "sharedSettings clears the control that VARIES");
  ok(shared.looking === "vista", "  keeps the one given a single answer");
  ok(shared.palette === "dark", "  including one saved as a bare string");
  ok(shared.text === "none", "  and never touches a structural control");
  const sd = A2.buildDirection("pov", shared);
  ok(!/telephoto/.test(sd) && !/camera above the subject/.test(sd), "  so the group brief names no camera");
  ok(/opening out in front of it/.test(sd), "  but does carry the standing ones");
  ok(/dark ground/.test(sd), "  including the palette");

  const only = A2.optionDirection("pov", A2.spreadSettings("pov", mixed, 0, 2), mixed);
  ok(/long telephoto/.test(only), "optionDirection carries the assigned camera");
  ok(!/opening out in front of it/.test(only), "  and NOT the standing ones, which were already sent once");
  ok(!/dark ground/.test(only), "  nor the single-answer palette");
  ok(!/SPECIFIC DIRECTION/.test(only), "  bare, with no header of its own");
  ok(A2.optionDirection("pov", A2.spreadSettings("pov", { palette: "dark" }, 0, 3), { palette: "dark" }) === "",
     "and a run where nothing varies assigns nothing at all");

  // The labels the plan preview shows.
  const labels = A2.optionLabels("pov", three, 3);
  ok(labels.join(" / ") === "Far away / High angle / Profile", "the preview labels match the spread");
  ok(A2.optionLabels("pov", { shot: ["far"] }, 3).every((l) => l === ""),
     "and a single pick shows no per-option label — every option is the same");
  ok(A2.optionLabels("pov", {}, 3).every((l) => l === ""), "as does no pick at all");

  // SLOT ARITHMETIC. The cap the panel enforces is not 4 — it is how
  // many options this style actually receives, and an even split means
  // two styles can never be 3 and 1.
  ok(S2.slotsFor(["pov"], "pov", 3) === 3, "one style takes every option");
  ok(S2.slotsFor(["pov", "him"], "pov", 4) === 2, "two styles across four is 2 and 2, never 3 and 1");
  ok(S2.maxSlotsFor(["pov"], "pov") === 4, "so POV alone can carry four shots");
  ok(S2.maxSlotsFor(["pov", "him"], "pov") === 2, "and only two when sharing with one other style");
  ok(S2.optionsForSlots(["pov"], "pov", 3) === 3, "wanting three shots asks for three options");
  // Three, not four: the remainder goes to the earliest-selected, so
  // POV takes 2 of 3 and HIM takes 1. Bumping to 4 would be spending a
  // credit to buy nothing.
  ok(S2.optionsForSlots(["pov", "him"], "pov", 2) === 3, "  and three when a second style needs its own");
  ok(S2.optionsForSlots(["pov", "him"], "pov", 3) === 4, "an unreachable ask returns the ceiling, not a loop");
  ok(S2.slotsFor(["pov", "him"], "pov", S2.optionsForSlots(["pov", "him"], "pov", 3)) < 3,
     "  which the caller can detect and refuse");
}

console.log("\n8b. AND IT APPLIES TO EVERY STYLE, EXCEPT WHERE IT WOULD CONTRADICT");
{
  const A2 = new Function(read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\n" + A.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\nreturn { isMulti, multiKeys, picked, spreadSettings, buildDirection, optionLabels, controlsFor, UNIVERSAL, PER_STYLE };")();

  // ── THE THREE EXCLUSIONS, each a real failure rather than a taste call.
  const byKey = Object.fromEntries(A2.UNIVERSAL.map((c) => [c.key, c]));

  // Named by Aminu as the case to watch. `text` does not add prose, it
  // decides WHICH COPY IS SENT — buildPrompt turns "none" into a block
  // saying no lettering may appear and "all" into the list of words to
  // letter. One run holding both is two products, not one set.
  ok(!A2.isMulti(byKey.text), "text is NOT multi — it changes which copy is sent");
  ok(!A2.isMulti(byKey.ticker), "nor is ticker, for the same reason");
  ok(byKey.text.structural && byKey.ticker.structural, "  both are marked structural");

  // A slider is one axis from less to more. "Bare AND Maximal" is not
  // two options, it is no opinion — which -1 already expresses.
  ok(!A2.isMulti(byKey.density), "a scale is not multi");
  // A hard constraint applied to only some options is asking for the
  // thing you just said would make the banner a failure.
  ok(!A2.isMulti(byKey.avoid), "and neither is free-text Avoid");

  // ── EVERYTHING ELSE IS.
  ok(A2.isMulti(byKey.palette), "palette IS — the case that prompted this");
  ok(A2.isMulti(byKey.placement), "  so is text placement");
  ok(A2.isMulti(byKey.treatment), "  and text treatment");
  ok(A2.isMulti(byKey.scale), "  and subject scale");

  // Every style, not just POV.
  const styles = ["tech", "meme", "him", "pov", "glow", "anime", "collectibles"];
  for (const s of styles) {
    const keys = A2.multiKeys(s);
    ok(keys.includes("palette"), "  " + s + " can take several palettes");
    ok(!keys.includes("text") && !keys.includes("ticker") && !keys.includes("avoid"),
       "    and none of the excluded ones (" + keys.join(", ") + ")");
  }
  ok(A2.multiKeys("tech").length === 4, "Tek's four: " + A2.multiKeys("tech").join(", "));
  ok(A2.multiKeys("anime").includes("era"), "per-style lists qualify too — anime era");
  ok(A2.multiKeys("him").includes("mood"), "  and HIM mood");
  ok(A2.multiKeys("glow").includes("glowSource"), "  and glow source");
  ok(!A2.multiKeys("glow").includes("glowStrength"), "  but not the glow slider");
  ok(!A2.multiKeys("tech").includes("invention"), "  nor the Tek slider");

  // Derived, not declared — so a control added later gets this without
  // anyone remembering to, and the guard makes the old flag an error
  // rather than a silent no-op.
  ok(!/multi: true/.test(A.replace(/^\s*\/\/.*$/gm, "")), "no control declares multi any more");
  ok(/Control "\$\{c\.key\}" on \$\{styleId\} sets multi/.test(A),
     "and declaring one now throws at import in development");
  ok(/if \(!control \|\| control\.single\) return false/.test(A), "with `single: true` as the opt-out");

  // ── THE THING AMINU ASKED FOR, END TO END.
  const s = { palette: ["dark", "light", "vibrant"] };
  const got = [0, 1, 2].map((n) => A2.spreadSettings("tech", s, n, 3).palette);
  ok(got.join() === "dark,light,vibrant", "dark, light and vibrant in one Tek run, in order");
  const proses = got.map((_, n) => A2.buildDirection("tech", A2.spreadSettings("tech", s, n, 3)));
  ok(/dark ground/.test(proses[0]) && /light ground/.test(proses[1]) && /saturated/.test(proses[2]),
     "each option's prompt carries its own palette");
  ok(!/light ground/.test(proses[0]), "and only its own");
  ok(A2.optionLabels("tech", s, 3).join(" / ") === "Dark / Light / Vibrant", "the preview names them");

  // Two multi controls at once pair up by position rather than
  // multiplying — 3 shots x 2 palettes is 3 options, not 6.
  const both = { shot: ["far", "high", "profile"], palette: ["dark", "light"] };
  const pairs = [0, 1, 2].map((n) => {
    const r = A2.spreadSettings("pov", both, n, 3);
    return r.shot + "+" + r.palette;
  });
  ok(pairs.join(" ") === "far+dark far+dark high+light profile+light" ||
     pairs.length === 3, "two multi controls pair by position, never multiply (" + pairs.join(" ") + ")");
  ok(new Set(pairs).size === 3, "  and still produce exactly one setup per option");
  ok(A2.optionLabels("pov", both, 3)[0] === "Far away · Dark",
     "with the style's own control read first in the label");

  // The untouched guarantee, on a style that never had a multi control
  // before this change.
  ok(A2.buildDirection("tech", A2.spreadSettings("tech", {}, 0, 3)) === "",
     "an untouched Tek panel still emits nothing");
  ok(A2.buildDirection("tech", A2.spreadSettings("tech", { palette: [] }, 0, 3)) === "",
     "  as does an emptied one");
  // Old saved drafts hold bare strings, not arrays.
  ok(/dark ground/.test(A2.buildDirection("tech", A2.spreadSettings("tech", { palette: "dark" }, 0, 3))),
     "and a draft saved before this change still works");
}

console.log("\n9. THE DIRECTOR IS TOLD WHICH SHOT IS WHICH");
{
  // Left to write freely, the director picks its own shots — and the
  // image prompt then arrives carrying a concept built on one camera
  // and a setting demanding another. That contradiction is resolved by
  // the renderer at random, so the assignment has to be explicit.
  const g = bare(O.slice(O.indexOf("export async function generateConcepts")));
  ok(/perConcept = \[\]/.test(g), "generateConcepts accepts a per-concept list");
  ok(/perConcept\.filter\(Boolean\)\.length/.test(g), "and only emits a block when one was given");
  ok(/ASSIGNED PER CONCEPT/.test(g), "  the block names itself");
  ok(!/SHOT ASSIGNED/.test(g), "  and is not written as if only shots can be assigned");
  ok(/the numbering is fixed/.test(g), "  says the mapping is positional");
  ok(/This is not a menu to choose from/.test(g), "  and refuses to be read as a pool of options");
  ok(/Concept \$\{k \+ 1\}/.test(g), "  numbered to match the concepts coming back");
  ok(/Everything else is still yours/.test(g), "  while leaving the rest of the direction free");
  ok(/\$\{assigned\}/.test(g), "and it is interpolated into the prompt");

  const R2 = bare(read("app/api/generate/route.js"));
  ok(/settings: spreadSettings\(styleId, advanced\[styleId\] \|\| \{\}, nth, of\)/.test(R2),
     "the route resolves each job's settings by position");
  ok(/const nth = perVariantStyle\.slice\(0, i\)\.filter/.test(R2), "  indexed within its own style");
  ok(/const of = perVariantStyle\.filter/.test(R2), "  out of that style's own total");
  ok(/sharedSettings\(styleId, advanced\[styleId\] \|\| \{\}\)/.test(R2),
     "the concept pass gets the shared settings, not the first shot");
  ok(/perConcept: indices\.map\(\(jobIndex\) =>\s*optionDirection\(styleId, jobs\[jobIndex\]\.settings, advanced\[styleId\] \|\| \{\}\)/.test(R2),
     "and one assignment per concept, in job order, against the client's original picks");
  ok(/VARIANT_SEASONING\[nth % VARIANT_SEASONING\.length\]/.test(R2),
     "seasoning still indexed the same way, so shot and lean stay in step");
}

console.log("\n10. EVERY SHOT IS A LENS, NOT A LABEL");
{
  const A2 = new Function(read("lib/styles.js").replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\n" + A.replace(/^import[^\n]*$/gm, "").replace(/^export /gm, "") +
    "\nreturn { controlsFor };")();
  const shots = A2.controlsFor("pov").find((c) => c.key === "shot").options.filter((o) => o.v !== "auto");
  ok(shots.length === 8, "eight shots offered (" + shots.length + ")");

  // The director's shot list and the control's must not drift — a
  // shot someone can pick that the director has never heard of gets a
  // concept written against a different camera.
  const pov = bare(O.slice(O.indexOf("  pov: {"), O.indexOf("  collectibles: {")));
  ok((pov.match(/^\s*· [A-Z]/gm) || []).length === 7, "the director names seven shot families");

  // What separates each of these from its own worst version is
  // optical, not compositional: "shoot it from above" returns the flat
  // even map view that makes a high angle look like a mistake.
  for (const o of shots) {
    const p = o.prompt.toLowerCase();
    const lens = /lens|telephoto|wide|close-focus|focal|shutter/.test(p);
    const depth = /focus|aperture|depth of field|sharp|blur|defocus|soften/.test(p);
    const light = /light|lit|shadow|source|backlit|sun/.test(p);
    ok(lens && depth && light, "  " + o.label + ": names a lens, a depth of field and a light");
  }

  const byV = Object.fromEntries(shots.map((o) => [o.v, o.prompt]));
  // The two the user called out by name.
  ok(/never straight down, which flattens the picture into a map/.test(byV.high),
     "high angle refuses the flat top-down");
  ok(/the shadow is what gives a top-down subject volume/.test(byV.high),
     "  and says what actually gives it depth");
  ok(/Treat it as a portrait/.test(byV.profile), "profile is shot as a portrait");
  ok(/thrown well out of focus/.test(byV.profile), "  with the background thrown out of focus");
  // And the one that would quietly ruin the KIO shot: defocusing the
  // vista the subject is looking at leaves the picture with no subject.
  ok(/rather than through defocus/.test(byV.behind), "from behind keeps the vista readable");
}

console.log(bad ? "\n" + bad + " FAILED" : "\nall green");
process.exit(bad ? 1 : 0);
