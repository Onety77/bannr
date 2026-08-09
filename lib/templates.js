// ============================================================
// BANNR STYLE SYSTEM
// Each style = data, not code. Add one by adding an object here
// (later: a Firestore document — same shape).
//
// mood: the full creative brief for the category, appended to the
//   shared doctrine by buildPrompt(). Deliberately long-form prose
//   rather than a keyword list — it says what the style IS, and
//   just as importantly what to AVOID, since the clichés are the
//   main failure mode for every one of these. THIS is the product.
// thumb: preview image at public/styles/<file>, shown in the
//   picker so people choose by eye rather than by guessing at a
//   name. Missing files degrade to a name-only tile (see the
//   picker in app/create/page.jsx) — nothing breaks.
// layout / text: only used by the zero-config demo fallback
//   (procedural background + composited text/logo). Once an AI
//   engine is configured it renders the whole banner itself, text
//   and logo included, and this layout data goes unused. Kept
//   uniform across styles on purpose — tuning it would be effort
//   spent on a path real users never see.
// demo: recipe for the procedural background used when no engine
//   is configured, so the app runs day one.
// ============================================================

// SERVER ONLY, and enforced rather than intended. This module holds
// every prompt in the product; it used to be imported by client
// components for style names, which shipped the whole creative
// direction to the browser. This import makes that a BUILD failure
// rather than something to remember. Display metadata lives in
// lib/styles.js, which the browser may have.
import "server-only";
import { buildDirection } from "./advanced.js";
import { STYLES, AUTO_ID, AUTO_NAME, distributeStyles } from "./styles.js";

// Re-exported so server code has one import for everything.
export { AUTO_ID, AUTO_NAME, distributeStyles };

export const BANNER_W = 1500;
export const BANNER_H = 500;
export const X_BANNER_W = 1300; // X Communities banner

// "Default" — no style guidance at all; the model invents the
// best-fitting direction from the brief alone. Kept as an id rather
// than a TEMPLATES entry because it is the absence of a style, not
// one of them.
//
// The label has been "Auto" and then "Normal", both of which described
// the mechanism rather than the role. It is the one you get if you
// choose nothing, which is what "Default" means. The stored id stays
// "auto" so existing history and shared /create?style= links keep
// resolving.
// AUTO_ID / AUTO_NAME now live in lib/styles.js — the picker needs
// them and the picker is client code. Re-exported at the top of this
// file so server imports still find them here.

// Shared demo-mode layout. See the header note: identical for every
// style by design.
const DEMO_LAYOUT = {
  logo:   { x: 90,  y: 145, size: 210, ring: true },
  ticker: { x: 340, y: 235, size: 92,  weight: 900, tracking: 2, glow: true },
  name:   { x: 344, y: 300, size: 33,  weight: 600, tracking: 6, upper: true },
  tag:    { x: 344, y: 350, size: 22,  weight: 400, tracking: 1 },
};

// Display metadata is authoritative in lib/styles.js. Anything here
// that repeats it is checked below rather than trusted, because two
// copies of a style's name in two files will eventually disagree.
export const TEMPLATES = [
  {
    id: "tech",
    // Displayed as "Tek" — the id stays "tech" because it keys the
    // reference folder, saved history, shared /create?style= links and
    // saved per-style settings. A label is cosmetic; an id is a
    // contract with everything already written down.
    name: "Tek",
    tagline: "Authored, not assembled.",
    // The uploaded image is a brand mark, not a character to be posed
    // somewhere. Kept even though this style no longer receives the
    // doctrine: with nothing to override, the block's remaining job
    // is to say the mark must survive as the client's own.
    graphic: true,
    // Lets the model author a short line from the briefing when the
    // client hasn't written one. An OPTION, not a slot to fill: this
    // style is equally free to carry no supporting line at all.
    wantsTagline: true,
    // This style does not receive the shared doctrine at all.
    //
    // The doctrine is written for styles that build a WORLD around a
    // subject, and this one composes a designed surface. Every time
    // the two met, the doctrine won something it should not have:
    // typography that may never dominate, emptiness that "reads as
    // unfinished", a place inferred for the logo to stand in. The
    // fixes kept taking the same shape — send a rule, then send a
    // block cancelling it — which is strictly worse than never
    // sending it, because a model that has read both has to decide
    // which one it is being tested on.
    //
    // The brief below is complete on its own: it says how to think,
    // what to reject, and what good looks like. It does not need
    // supervision. The one doctrine rule genuinely worth keeping —
    // that the client's mark stays the client's mark — is carried
    // over explicitly by the `graphic` block instead.
    soloBrief: true,
    // Every variant gets its own written concept from the art-director
    // pass. This style is the reason that pass exists: no amount of
    // prose ever stopped the image model defaulting to mark-left,
    // name-right, empty field. The thinking has to happen in a text
    // model, which can actually read "on-chain index funds named
    // Bento" and notice the bento box IS the basket.
    concepts: true,
    // Reads references/tech/*. Some styles cannot be reached by
    // description alone — "brand-grade design work" is a bar you
    // recognise instantly and can barely put into words, and every
    // prose rewrite here either produced a house layout or drifted
    // into generic futurism. Showing the standard is the only reliable
    // way to set it. Degrades to nothing if the folder is empty.
    useReferences: true,
    // ══ THE HARD NO, SAID LATE ══
    //
    // Every one of these was already banned — in the mood above, and
    // again in the design director's concept rules. They came back
    // anyway, twice in one run, because of WHERE the ban sat rather
    // than whether it existed: buried mid-paragraph near the top of a
    // long prompt, with the concept, the client's direction and the
    // framing all landing after it. Models weight the end.
    //
    // And because of HOW it was phrased. The mood explained that
    // circuitry is decoration standing in for an idea and concluded
    // "none of them is necessary" — which is advice, and reads as
    // optional. The type paragraph beside it, which actually holds,
    // is a list of flat imperatives: no bevel, no chrome, no extrude.
    // This is the type paragraph's grammar applied to the other
    // failure.
    //
    // Emitted just before the client's own words, so a client who
    // genuinely wants a circuit board still gets one — see the note
    // on ordering in buildPrompt.
    forbid: [
      "circuit boards, circuit traces, PCB patterns or anything resembling an electronic board — as a background, a texture, a border, a watermark or a surface the type sits on",
      "hexagon grids, wireframe globes, floating code, binary digits, terminal windows and drifting sci-fi interface panels",
      "glowing particle fields, data streams, network-node constellations and lens flares used as atmosphere",
      // Added after a Tek run returned sixteen banners of brass doors,
      // cogs, keys and honeycomb for a launchpad. Every one of them
      // was an illustration of the project's NAME or its TAGLINE, and
      // none of the bans above covered ornate machinery — so the
      // clichés simply moved next door.
      "ornate machinery, gears, cogs, brass and copper fittings, engraved or filigreed metal, keys, padlocks, chains, safes, vaults and any steampunk or Victorian-industrial apparatus",
      "elaborate 3D-rendered scenes, fantasy or sci-fi environments, cityscapes, and dramatic volumetric lighting through a built set — a modelled tableau with the project name laid over it is not a designed banner",
      "any picture whose subject is what the project's NAME literally means, or what its TAGLINE literally describes — the word earns at most a colour or one quiet motif, never the image",
    ],
    accent: "#2451FF",
    thumb: "tech.jpg",
    mood: `This is brand-grade design work — the standard a serious studio delivers to a client with taste.

Approach every project as a unique design problem rather than a template to fill. Before placing a logo, image, or text, identify the strongest visual opportunity hidden within the project's identity, product, story, or purpose, and let that idea drive the entire composition. The goal is not simply to make a clean technology banner, but to create something that feels inseparable from that specific project — as if no other brand could own it. Sometimes the typography becomes the artwork, sometimes the environment tells the story, sometimes the product itself defines the layout, and sometimes the most powerful decision is restraint. Do not default to placing a logo beside a title and tagline. Instead, explore composition freely: text may be centered, oversized, tiny, rotated, partially cropped, integrated into the environment, layered behind subjects, aligned to architectural lines, placed in unexpected corners, or omitted entirely if the visual communicates more effectively. A banner should feel discovered rather than assembled.

Treat graphic design as a creative medium rather than decoration. Use typography, scale, geometry, photography, illustration, landscapes, architecture, objects, materials, lighting, perspective, or negative space only when they strengthen the central idea. Some banners may be almost entirely typographic, others may rely on a single cinematic image, while others may contain almost no text at all. There should be no recognizable layout formula across projects. If two unrelated projects could realistically receive the same composition with only the logo swapped, the design has failed. Every banner should feel authored specifically for its subject.

Think like a creative director presenting a concept to a client, not an image generator arranging assets. Surprise the viewer with an idea they would not have considered, while making it feel so natural that it seems inevitable. The strongest banners don't merely present a brand — they reveal a visual identity that already feels like it belonged to the project all along.

THE GROUND IS ONE THING, AND IT IS QUIET. A flat colour. One material, photographed honestly. A single photograph. A printed surface. A geometric system. Choose one and leave it almost empty. Everything the banner says is said by what you place on that ground and by how much room you leave around it. Do not build a scene, and do not fill the frame with invented objects, machinery, architecture or scenery. The strongest work in this category is almost empty, and a banner that needs a busy world to hold attention has no idea in it yet.

THIS IS DESIGN, NOT A RENDER. No elaborate modelled tableaux. No ornate machinery, gears, brass fittings, engraved metalwork, keys, padlocks or vaults. No fantasy environments, no dramatic volumetric light pouring through a built set, no photoreal 3D scene with the project name laid over the top. A serious studio ships flat graphic work, considered photography and real typography — the thing you are imitating is a design agency's deliverable, not a film frame or a games trailer.

DO NOT ILLUSTRATE THE NAME. A project called Honey is not honey, honeycomb or bees; one whose tagline says "locked" is not locks, chains or safes. Drawing the word is the first idea anyone has and it is nearly always the weakest — it describes the label rather than the company, and the same banner would serve any other project with that name. The word may earn a colour or one quiet motif. It never earns the picture.

One habit to break: the generic futurism a technology brief tends to attract. Circuit boards, floating code, holographic interfaces, hexagon grids, binary text, glowing particles and drifting sci-fi UI are decoration standing in for an idea — the thing you reach for when the concept is not strong enough to carry the frame.

A second habit, and the more dangerous one because it arrives disguised as polish: rendering the type as a material. The project name is set in flat, clean letterforms — real typography, the way it leaves a studio. No metallic, chrome, gold or brushed-steel fills. No bevel, emboss, inner glow, drop shadow or outer stroke. No extruded three-dimensional letters standing off the surface or receding into perspective. No gradient poured down the type, no specular highlights, no reflections in the letterforms. Depth belongs to what sits behind the name — to what is photographed, built, printed or arranged — never to the letters themselves. Type wearing a machined-metal finish is the fastest way to look like a 2009 Photoshop tutorial, and it is the first thing a client with taste will notice. Metal in the ARTWORK is welcome when the project genuinely points at it and it is a real material honestly lit; a gold gradient poured over a wordmark is not the same thing and is never the answer. If the client has explicitly asked for metallic or dimensional lettering, give it to them — otherwise the type stays flat.`,
    layout: DEMO_LAYOUT,
    text: { color: "#0E1220", accentUse: "underline" },
    demo: { kind: "clean" },
  },
  {
    id: "meme",
    name: "Meme",
    tagline: "The joke, told visually.",
    // The least predictable style in the product — sometimes genuinely
    // funny, sometimes nonsense — because "be funny" was being asked of
    // a renderer. Comedy is a reasoning act: you have to know what a
    // thing IS before you can know what is funny about it. So this gets
    // the same art-director pass as Tech, with a comedy director rather
    // than a brand one.
    concepts: "meme",
    accent: "#FFB020",
    thumb: "meme.jpg",
    mood: `Treat the uploaded subject as a meme first and a brand second. The goal is not simply to make it funny, but to understand the personality, absurdity, or emotion that makes the meme memorable and communicate it visually. Build a scene that amplifies the joke, attitude, or narrative without explaining it through text. Lean into exaggeration, irony, timing, unexpected situations, and strong visual storytelling while maintaining a polished composition. Humor should emerge naturally from the artwork rather than from random effects, internet clichés, or excessive chaos. Every meme deserves its own world instead of being placed into a generic meme template.`,
    layout: DEMO_LAYOUT,
    text: { color: "#FFFFFF", accentUse: "outline" },
    demo: { kind: "cartoon" },
  },
  {
    id: "him",
    name: "HIM",
    tagline: "Pure presence. Owns the frame.",
    noText: true,
    // TRIAL. This style was working well undirected, so this is being
    // tried rather than assumed — the bet is that a director can read
    // what kind of authority a given subject actually has (menacing,
    // serene, deadpan, weary) and stage for that, instead of one
    // generic idea of "presence" applied to everything.
    //
    // To revert: delete this line. Nothing else depends on it.
    concepts: "him",
    accent: "#E4593B",
    thumb: "him.jpg",
    mood: `This banner is about presence. Treat the uploaded subject as the undisputed center of attention and compose everything around it. The subject should dominate the frame with confidence, occupying much of the composition without feeling forced or oversized. Avoid distractions, unnecessary supporting objects, or busy environments that compete for attention. Instead, use lighting, scale, perspective, framing, atmosphere, and negative space to reinforce the feeling that the subject owns the scene. The overall impression should be quiet confidence, authority, and undeniable presence rather than loud spectacle.

It is a FRAME FROM A FILM, not an illustration of a character. Shoot it: a long lens, one motivated light source with real falloff into shadow, shallow depth so the subject is the only thing fully resolved, and air the light can travel through. The subject is caught mid-moment rather than posed, and the world carries on past the edges of the frame.

Cinematic is a craft, not a filter, and the difference decides whether this looks expensive or cheap. It is the lens, the light and the moment. It is NOT teal-and-orange grading, lens flares, letterbox bars, grain laid over the top, or "epic" as a mood — those are what gets added when the framing did not do the work, and they read instantly as an effect switched on. If it would still hold as a film still under flat grey light, the framing is right.`,
    layout: DEMO_LAYOUT,
    text: { color: "#EDEAE2", accentUse: "dot" },
    demo: { kind: "minimal" },
  },
  {
    id: "pov",
    name: "POV",
    tagline: "The angle you never shot.",
    // ══ THE STYLE THAT BREAKS THE HOUSE RULE ══
    //
    // Every other style is safe for the same reason: the subject is
    // never redrawn, so it can never come back wrong. HIM says it
    // outright — "you have one view of this subject… never turn what
    // you were given" — because inventing a surface nobody has seen is
    // how a subject becomes a lookalike.
    //
    // That rule is right, and it also puts an entire category of good
    // banner out of reach. The character seen from behind, small,
    // looking out over the thing it rules; the profile a front-facing
    // avatar can never show; the camera on the ground looking up. Those
    // exist and people make them, and this product could not.
    //
    // So the risk is taken HERE and nowhere else. Choosing this card is
    // the user consenting to a redraw, which is why it is a style
    // rather than a loosening of the shared doctrine. Nothing above or
    // below this object changed to make it work.
    //
    // The likeness discipline moves rather than disappears: `reangle`
    // below spends most of its length on what must survive the turn,
    // and the director is required to name those features per concept
    // and to refuse views that would hide all of them.
    reangle: true,
    // Vision is not optional on this one. Every other director can work
    // from a noun; this one has to know whether the thing HAS a back,
    // a profile, a volume — a flat wordmark cannot be walked around,
    // and proposing it a back view is how the style fails.
    concepts: "pov",
    accent: "#0FBFD4",
    thumb: "pov.jpg",
    mood: `Choose where the camera goes, and let that choice be the whole idea. The uploaded image is one view of this subject — usually the flattest one, facing straight out, because that is what an avatar has to be. This style delivers the shot that view could never give: the same character, seen from somewhere else.

The camera is the concept. From behind, over the shoulder, so the viewer stands where the subject stands and looks at what it is looking at. In profile, the line of the face against the light. Low, from the ground, so the thing rises. High and far, so it is small against the world it belongs to. Close enough that one detail fills the frame. Turned three-quarters away, caught mid-step, walking out of shot. Pick one deliberately and commit to it — a slight rotation of the same head-on portrait is not a shot, it is a wobble.

IT IS THE SAME CHARACTER. This is the only thing that can go wrong here and it is the thing that matters most: turning the subject is not permission to invent a new one. Species, build, proportions, palette, markings, costume, material and the medium it is drawn in all carry over exactly. Someone who knows this character must recognise it from behind, in silhouette, at a distance, from a detail. If the finished subject is merely a similar-looking thing in a nice shot, the banner has failed no matter how good the shot is.

So protect the tell. Every subject has two or three features that identify it — an ear shape, a mane, a hat, a scar, a colour split, a particular slouch — and the chosen angle must keep at least one of them plainly visible. A back view of a character who lives entirely in its face turns the head slightly, or catches the profile, or lets the shape of the ears carry it. Never choose a view that hides everything recognisable at once.

NOT LITERAL POV. The camera is not the subject's eyes and the frame is not what it sees. The subject is IN the picture — from behind, from the side, from below, from far away, but present. A landscape with the subject missing is not this style, it is a missing subject.

Some subjects cannot be walked around, and forcing it is the other way this fails. A flat wordmark, an emblem, a badge, a purely geometric mark — these have no back and no profile, and pretending otherwise produces nonsense. For those, re-angle the mark in SPACE instead of re-posing it as a character: seen at an oblique angle as a real object, on a surface, in a room, catching light across its face, in perspective. The camera still moved; it just moved around an object rather than around a body.

Whatever the shot, the composition earns its width. The best of these leave a large calm area where the subject is not — sky above a low horizon, the ground ahead of a figure, the empty half a profile is facing into. That space is where the name goes, and it should be planned as part of the shot rather than found afterwards.`,
    layout: DEMO_LAYOUT,
    text: { color: "#FFFFFF", accentUse: "dot" },
    demo: { kind: "minimal" },
    // ══ THE HARD NO, SAID LATE ══
    //
    // All three are specific to asking for a new camera angle, and none
    // is a thing the model would produce unprompted:
    //
    // "Show it from another angle" invites a TURNAROUND — the same
    // character drawn two or three times across the frame, which is a
    // model sheet, not a banner. Naming the style POV invites the word
    // POV lettered onto the image and the camera furniture that goes
    // with it. And the film meaning of POV invites the first-person
    // shot the mood already rules out — hands reaching toward camera,
    // subject absent.
    forbid: [
      "the subject appearing more than once in the frame — no side-by-side views, before-and-after halves, split screens, turnaround or model sheets, reflections showing a second copy, or the same character repeated at different angles",
      "camera and viewfinder furniture: crosshairs, focus brackets, a recording dot, timecode, battery or REC indicators, film-strip or sprocket borders, letterbox bars, or the word POV lettered anywhere",
      "a first-person shot with the subject absent — hands, paws, arms or objects held out toward the camera standing in for the character",
    ],
  },
  {
    id: "glow",
    name: "Glow",
    tagline: "Backlit. The edge does the work.",
    accent: "#7C5CFF",
    thumb: "glow.jpg",
    // "Glow" is a trap word. Read plainly it means ambient luminosity,
    // so the old brief — light "originating from behind or around the
    // subject" — kept producing backlight, haze and bloom: a bright
    // sky, a soft halo, a lit-up scene. All of that describes a light
    // SOURCE, and none of it is what this style is.
    //
    // It is RIM LIGHT: a thin bright edge on the subject's own
    // contour. The brief below never uses the bare word glow without
    // saying where the light lands, and spends most of its length on
    // what this is NOT, because that is the half that was failing.
    mood: `The subject is edged in light. A warm band of it gathers along the contour where a source set behind picks up the silhouette, and that glow IS this style. Everything else exists to let it read.

IT IS SOFT, and this is the single decision that separates a glow from an outline. The band has no hard boundary anywhere. It is at its brightest right on the contour, falls away into the form over a short distance, and carries a little into the air just beyond the edge so the light and the background meet without a seam. If you could trace where it stops with a pen, it has stopped being light and become a stroke. Thin, crisp and even is a sticker; soft, gathered and uneven is light.

Be exact about where it lands, because the word glow is usually taken to mean something else. It is not haze filling the air across the frame. Not a halo or aura floating around the subject as a separate shape with a gap between. Not a bright sky or a sun doing the work behind it. Not a neon line drawn on afterwards. It is the subject's own edge catching light — along the fur, the shoulder, the jaw, the lip of the object — softly enough that the form lifts off what sits behind it without being cut out of it.

It is uneven. Brightest where the surface turns away from the viewer toward the source, thinning as the form rolls back toward the camera, fading out completely where the silhouette faces away. Never a band of even weight running the whole way round — that is the other way this collapses into an outline.

RESTRAINT IS THE STYLE, not a caveat on it. Soft does not mean large: the glow stays close to the contour and occupies a fraction of the frame. The ground stays dark or muted so the edge has something to be seen against, and no second light competes with it. If the picture looks lit up, it has failed. The subject should be noticed first and the light second — someone should feel the separation before they work out how it was done.

Unlike HIM, tasteful typography is welcome here wherever it strengthens the composition.`,
    layout: DEMO_LAYOUT,
    text: { color: "#FFFFFF", accentUse: "glow" },
    demo: { kind: "neon" },
  },
  {
    id: "anime",
    name: "Anime",
    tagline: "Official key visual, not a filter.",
    // Overrides the doctrine clause that says the subject's STYLE must
    // stay intact. Without this the model satisfies both instructions
    // the only way it can: leaves the subject in its original rendering
    // and anime-fies the background around it.
    restyle: "high-quality anime illustration",
    // Same disease Tek had — subject one side, name the other, over a
    // gradient — and the same cause: an image model asked to compose
    // rather than execute. Anime is also where a reasoning model
    // brings the most, because the genre has an enormous and very
    // specific visual grammar that a text model knows in detail and a
    // renderer only reaches if something names it.
    concepts: "anime",
    accent: "#FF5C8A",
    thumb: "anime.jpg",
    mood: `Reimagine the uploaded subject through the language of high-quality anime illustration while preserving its identity and recognizability. Focus on expressive composition, dynamic perspective, clean line work, rich color harmony, and cinematic framing inspired by modern anime films, key visuals, and premium promotional artwork. The environment, lighting, and mood should feel hand-crafted rather than generated. Avoid generic anime clichés such as random speed lines, floating sakura petals, exaggerated magical effects, or over-the-top action unless they naturally suit the subject. The result should feel like official anime artwork created specifically for this project rather than simply applying an anime filter.`,
    layout: DEMO_LAYOUT,
    text: { color: "#FFFFFF", accentUse: "outline" },
    demo: { kind: "cartoon" },
  },
  {
    id: "collectibles",
    name: "Collectibles",
    tagline: "One subject, many variants.",
    noText: true,
    // A fixed prompt produced a fixed look: every hand-cut set came
    // back as white polaroid borders on white, every grid as thin white
    // lines. Twenty of those and the style reads as bannr's rather than
    // the project's, which is the opposite of what anyone is buying.
    // The director decides the ground, the edges and the arrangement
    // per option, inside whatever the client set.
    concepts: "collectibles",
    accent: "#2FD98B",
    thumb: "collectibles.jpg",
    mood: `Transform the uploaded subject into a collection of memorable variations rather than a single composition. The banner should present multiple versions of the same recognizable subject, each occupying its own panel or compartment while preserving a strong shared identity across the entire set. Every variation should introduce a different accessory, outfit, expression, role, theme, profession, pop-culture reference, seasonal look, or visual joke that feels natural for that subject. The variations should be genuinely diverse instead of repeatedly swapping hats or glasses, and should celebrate creativity over randomness. Design the panel layout as part of the artwork rather than a rigid template — experiment with different grid sizes, spacing, proportions, rotations, borders, divider styles, or compartment shapes so no two banners feel structurally identical. The layout should remain clean, balanced, and immediately readable, with the overall collection feeling like a premium set of collectibles, sticker pack, trading cards, or character variants rather than duplicated images arranged in boxes.

Whatever sits behind the set is a SURFACE, not a scene — the material it is printed on or pinned to. Keep it quiet and close to plain. The variations are the subject, and a detailed environment behind them is competing with the thing anyone actually came to look at.

Treat the subject as the master reference for the entire collection. Preserve its identity, proportions, pose, framing, expression, orientation, silhouette, and overall appearance consistently across every variation. Do not redesign, redraw, or reinterpret the subject for different themes. Instead, layer each variation onto the same underlying character by changing only contextual elements such as accessories, clothing, hairstyles, props, colors, or small thematic details. The humor and personality should come from seeing the same familiar subject transformed in different ways, not from changing who or how it is.`,
    layout: DEMO_LAYOUT,
    text: { color: "#F8F4E3", accentUse: "glow" },
    demo: { kind: "pixel" },
  },
];

// Divide N options across the chosen styles: even split, with any
// remainder going to the earliest-selected. 3 styles + 4 options =
// [s1, s1, s2, s3]. Guarantees at least one of every style picked,
// which is why the UI refuses to run with fewer options than styles.
//
// Exported and used by BOTH the picker and the route so there is one
// definition of the rule — the UI's preview of what you'll get can't
// drift from what the server actually generates.
// distributeStyles moved to lib/styles.js: /create needs it to show
// how many banners each style will produce, and that is client code.
// Re-exported at the top of this file.

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

// Demo mode and Auto both still need a concrete template object to
// hang procedural-background/layout data off of — this just isn't
// the same thing as choosing the AI's creative direction anymore.
export function randomTemplate() {
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
}

// Every field that changes what the model is TOLD, as opposed to what
// demo mode draws.
//
// Default mode borrows a template purely for layout/demo data — see
// autoTemplate below — and a comment in the generate route used to
// promise that borrowed template "never reaches the AI prompt". That
// was true when a style carried nothing but a mood. It has not been
// true since: graphic, restyle, noText, wantsTagline, soloBrief,
// useReferences and concepts were all added afterwards, and every one
// of them silently rode along.
//
// Adding a new prompt-affecting field to a style means adding it here.
export const PROMPT_FIELDS = [
  "mood", "graphic", "restyle", "reangle", "noText",
  "wantsTagline", "soloBrief", "useReferences", "concepts",
];

// A template safe to hand Default mode.
//
// Demo mode and /api/convert need a concrete template to hang layout
// and text-placement data off, so one is still picked at random. This
// strips everything that would otherwise instruct the model, because
// "Default" means the model invents the direction from the brief —
// not that it inherits another style's rules without that style's
// brief to make sense of them.
//
// What that leak actually did: a Default run had a 2-in-6 chance of
// producing a banner with NO TEXT AT ALL (him, collectibles), a 1-in-6
// chance of being redrawn as anime, a 1-in-6 chance of skipping the
// shared doctrine and reading the Tek reference set, and a 5-in-6
// chance of being routed through some director written for a style
// nobody chose. One in six came out as intended.
export function autoTemplate() {
  const clean = { ...randomTemplate() };
  for (const f of PROMPT_FIELDS) delete clean[f];
  return clean;
}

// A style whose name or thumbnail differs between the two files is a
// bug that would otherwise show up as a mislabelled picker tile long
// after the change that caused it. Cheap to check at import time, and
// only in development — production should never pay for it.
if (process.env.NODE_ENV !== "production") {
  for (const t of TEMPLATES) {
    const meta = STYLES.find((s) => s.id === t.id);
    if (!meta) throw new Error(`Style "${t.id}" has prompts but no metadata in lib/styles.js`);
    for (const k of ["name", "tagline", "accent", "thumb"]) {
      if (meta[k] !== t[k]) {
        throw new Error(`Style "${t.id}" disagrees on "${k}": styles.js has ${JSON.stringify(meta[k])}, templates.js has ${JSON.stringify(t[k])}`);
      }
    }
  }
  for (const meta of STYLES) {
    if (!TEMPLATES.some((t) => t.id === meta.id)) {
      throw new Error(`Style "${meta.id}" is in lib/styles.js but has no prompts in lib/templates.js`);
    }
  }
}

// ------------------------------------------------------------
// THE CREATIVE DOCTRINE — the shared craft floor. Most categories add
// one mood note on top of it; Normal adds none at all and leaves the
// whole direction to the model. Nothing here dictates colors,
// coordinates, or a checklist of required text — that's the point.
//
// It is NOT universal. A style carrying `soloBrief` opts out entirely
// because its own brief already covers this ground and disagrees with
// parts of it — see the note on Tech. Read this as the default for
// styles that depict a world, not as law.
// ------------------------------------------------------------
const DOCTRINE = `Do not begin by thinking about what objects to add; begin by thinking about what the subject represents. Let the concept determine the composition, not the other way around.

Treat every uploaded image as the identity of a brand, not merely an asset to place on a canvas. Before designing, infer the story, emotion, personality, and world that naturally surround it, then build a banner that expresses that world rather than illustrating the logo itself. Preserve the subject's identity rather than redesigning it — its proportions, recognizable features, style, and personality should remain intact unless explicitly asked otherwise. Supporting elements should enrich its world, never replace or overpower it.

Create an original visual direction for every subject instead of relying on recognizable AI aesthetics or repetitive design formulas. Avoid decorative paint splashes, brush-stroke typography, random particles, unnecessary geometric overlays, floating icons, excessive glow, forced gold or sepia color grading, and filler elements that exist only to occupy space. Favor authentic references over generic symbolism, and let atmosphere, lighting, scale and composition create the visual interest instead of decorative effects. Think like an experienced creative director solving a unique design problem, not an AI trying to make the image look "cool."

Space is a material, not a gap to be filled. A wide frame is not an instruction to reach every corner: the emptiness around a subject is what lets it command attention, and generous, deliberate negative space is one of the clearest signals of expensive design. Never enlarge type or scatter extra objects merely to occupy an area that feels bare — that bareness is usually doing the work. Give the banner ONE focal point. Every additional element competing to be looked at first makes the piece cheaper and harder to read.

Typography supports the composition and never dominates it. Use the minimum amount of text needed and let the visuals carry the message. Restraint is a strength: an elegantly chosen typeface at a modest size, lifted by nothing more than a soft shadow or a gentle weight shift, is frequently the more sophisticated answer. Reach for outlines, extrusion, heavy glow, metallic treatments, distressed textures or oversized display weights only when the concept genuinely calls for them. Choose type that reflects the subject's personality rather than one default look — refined serifs for historic subjects, clean modern sans-serifs for technology, expressive lettering for playful projects, understated elegance for luxury. It should always feel like it belongs to the world being created.

Placement deserves the same care as the type itself. A subject centred with a block of text on one side and emptiness on the other reads as unfinished. Compose the full width as one balanced image: type can sit behind or partly behind the subject, break across the frame, split so something anchors each side, run along an edge, or tuck into the scene as though it belongs there. Weight, negative space and the subject's own position should counterbalance one another so the eye finds the whole banner resolved — which is not the same as filling it.

Use the panoramic width to create balance, movement and visual storytelling rather than simply extending a centered image. Whenever several strong creative directions are possible, think independently, choose the one that best expresses the subject, and commit to it confidently instead of blending competing ideas.
`;

// ------------------------------------------------------------
// THE MANDATE — who the model is in this transaction. Kept separate
// from DOCTRINE (which is about craft) because this is about
// authority: nobody is art-directing these requests. Users arrive
// with a logo, a few rushed words and no idea what they want, and
// there is no round of notes afterwards. The model has to decide.
// ------------------------------------------------------------
const MANDATE = `You are the designer in charge, and you are exceptionally good at this.

Assume the person who uploaded this does not know what they want. They are not a designer, they cannot art-direct you, and they will not be there to give notes or approve a direction. Most will type a few rushed words and hope for the best. That is not an obstacle to work around — it is the job. Read what you are given, decide what this project actually needs, and deliver it with conviction.

So never wait for permission, never hedge between two ideas, and never produce something safe and empty because the input was thin. A vague brief is an invitation to use your own judgment, not a reason to retreat to a formula. Where the brief is silent, decide it yourself the way a senior creative director would — quickly, deliberately, and without asking.

Hand back something better than the client knew how to ask for.`;

// ------------------------------------------------------------
// THE HONEST CANVAS. gpt-image-2 renders 1536x512 — genuinely 3:1,
// the banner's own shape — so the whole canvas ships and there is
// no discarded band to warn about. This block therefore says one
// thing only: the frame is the deliverable, so keep every glyph
// inside it.
//
// History worth keeping, because it caused real bugs: the doctrine
// used to flatly assert "Aspect ratio is 3:1" while the engine was
// actually handed a 3:2 canvas that got centre-cropped, so the
// model composed for a frame it never had and text landed exactly
// where the crop threw it away. The fix was an honest per-engine
// safe-band description. gpt-image-2 removed the need for it
// entirely — the claim is finally just true.
// ------------------------------------------------------------
export const FRAMING = `Canvas and framing — technical constraints, not creative ones. Follow these exactly:

Your canvas is 1536 × 512 pixels — a true 3:1 banner, which is exactly the shape that ships. Nothing is cropped away, so every pixel you draw is part of the final product; compose for this frame and this frame alone.

No text may touch or run off any edge. Every glyph you draw must be complete and fully inside the frame — a banner with a clipped letter is a failed banner, however good the art is.

TEXT SAFE MARGIN, and this is a measurement rather than a preference: no part of any letter may come within 80 pixels of the left or right edge, or within 45 pixels of the top or bottom. Not the bounding box — the ink itself. A wordmark that stops 20 pixels short of the edge has satisfied "inside the frame" and still looks like it was pushed there, because the banner is displayed with rounded corners and other interface sitting immediately beside it, and anything hard against the edge reads as cut off even when it is whole.

THIS SAYS NOTHING ABOUT WHERE THE TEXT GOES. Centred, hard left, hard right, tiny in a corner, huge across the middle, running down one side, or absent entirely — every one of those is still yours to choose, and this rule is satisfied by all of them. It constrains one distance and nothing else. Do not read it as a preference for centred type, for text on a particular side, or for text at all.

The same margin applies to the ticker and to any supporting line. It does NOT apply to the artwork: the image, the subject and the ground should run to all four edges as they please.`;

// Non-creative guard rails appended after the doctrine.
const FORMAT = `No watermarks, no placeholder text, no UI chrome.`;

// ------------------------------------------------------------
// REASSURANCE — rung 2 of the refusal retry ladder.
// Meme-space briefs read edgier out of context than they are: the
// filter can't tell "degen casino coin" from something actually
// harmful, and most refusals are exactly that misreading. This
// block states the true intent and — the part that matters —
// explicitly licenses the model to render a tasteful version
// instead of refusing. It is only ever appended AFTER a first
// attempt was refused; the happy path never carries it.
// This is not evasion: it asks for a compliant image, and if the
// content is genuinely disallowed the retry fails too.
// ------------------------------------------------------------
// ------------------------------------------------------------
// ASSIST NUDGE — the middle rung, chosen by the user.
// Between "try again" (which already failed twice silently) and
// "reimagine" (which stops preserving the image at all) sits the
// move most refusals actually need: KEEP the subject faithful, but
// shift the medium away from photoreal reproduction toward designed
// illustration. Filters treat a stylised original far more kindly
// than a photographic likeness, and the user keeps their identity —
// so this is always offered before reimagine, never after.
// ------------------------------------------------------------
export const ASSIST_NUDGE = `Render the subject as original illustrated artwork rather than a photographic or literal reproduction of the attached image. Keep it genuinely recognizable — the same character, proportions, colour identity and personality — but the finished banner should read as a designed, stylised illustration serving the composition, not as a copy of the source photograph. Keep the treatment tasteful, respectful and suitable for a general audience: nothing suggestive, nothing that could demean or misrepresent anyone depicted.`;

export const REASSURANCE = `A note on intent, since parts of this brief may read as edgy out of context: this is a lighthearted community banner made purely for entertainment. Nothing in it is meant to demean, mock or target any real person or group, depict anything explicit, or promote harm — and the finished banner must not do any of those things either. This corner of internet culture leans playful and irreverent; take the most innocent, good-natured reading of every part of the brief and render a tasteful version of it. Prefer reinterpretation over refusal — there is a policy-friendly way to express this idea, and finding it is part of the job.`;

// Slot the user's brief into a prompt. `template` supplies the
// category mood (skipped entirely when `auto` is true — full
// creative freedom, not a random pick from the list). One call,
// straight to the image model, image attached alongside this same
// prompt — no separate reasoning pass. An earlier version added a
// text-model "director" step before rendering; it added a whole
// extra network call (more latency, more ways to fail) without the
// creative philosophy actually depending on it, since that
// philosophy already lives directly in DOCTRINE below. Removed.
// Is the ticker just the name restated? True when every character of
// the ticker appears, in order, somewhere in the name — which is the
// single shape underneath all three ways this happens:
//
//   whole word     Moonsoon / MOONSOON
//   word initials  Cat Wif Bat / CWB, Flying Unicorn Dust / FUD
//   compressed     Moonsoon / MSN, Bitcoin / BTC
//
// A ticker built from letters the name doesn't contain is genuinely
// new information and survives: Wonderland / TIME has no "t" or "m"
// to draw on, Doge Killer / LEASH has no "a", so both are kept.
//
// The bias is deliberately toward dropping. Wrongly dropping costs a
// name-only banner, which the doctrine already calls the right answer
// most of the time; wrongly keeping produces the duplicate lettering
// this exists to prevent.
function isDerivedFrom(ticker, name) {
  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = squash(ticker);
  const n = squash(name);
  if (!t) return false;
  let i = 0;
  for (const ch of n) {
    if (ch === t[i] && ++i === t.length) return true;
  }
  return false;
}

export function buildPrompt(template, brief, variantSeasoning = "", { auto = false, settings = {}, concept = "" } = {}) {
  const name = (brief.name || brief.ticker || "Unnamed project").trim();
  const ticker = (brief.ticker || "").trim();
  const tagline = (brief.tagline || "").trim();
  const about = (brief.vibe || "").trim();
  // What the client actually asked for, in their own words. Distinct
  // from About: that is context describing the project, this is an
  // instruction describing the banner.
  const wants = (brief.direction || "").trim();

  // A solo-brief style is trusted with its own creative direction and
  // is not sent the shared doctrine — see the note on the template.
  // The MANDATE still goes: that one is about AUTHORITY, not craft
  // (nobody is art-directing these, so decide and commit), and it
  // reinforces a self-directed brief rather than competing with it.
  const solo = !!template?.soloBrief;
  const parts = solo ? [MANDATE] : [DOCTRINE, MANDATE];

  parts.push(
    auto
      ? "No fixed category has been chosen for this one — invent the single best-fitting visual direction yourself, based entirely on the project brief below."
      : `Category mood for this piece: ${template.mood}`
  );

  // The brief is split into two explicitly labelled tiers, because the
  // model has no other way to tell renderable copy from context. When
  // name, ticker, tagline and about were concatenated onto one line,
  // "About:" read as simply more text to letter onto the banner — the
  // exact inversion of what it is. It is the one field that must never
  // be rendered, so it now sits in its own block that says so.
  // Stripped of its "$": the route normalises every ticker to "$FOO"
  // for the UI and history, but handing the model the symbol and then
  // telling it not to draw the symbol just invites the mistake.
  const bareTicker = ticker.replace(/^\$+/, "").trim();
  // The reliable fix for a name and its ticker both appearing on one
  // banner isn't a politer instruction — it's never sending the ticker
  // at all. A model cannot letter a string it was never given.
  // The ticker control overrides the automatic rule in both
  // directions: "always" forces it through even when derived, "never"
  // drops it even when it's genuinely new information.
  const nameCoversTicker =
    bareTicker.length > 0 && isDerivedFrom(bareTicker, name);
  const showTicker =
    settings.ticker === "always" ? true
    : settings.ticker === "never" ? false
    : bareTicker.length > 0 && !nameCoversTicker;

  // Which copy the model is allowed to see at all. The style's own
  // default can be overridden in either direction — a user who turns
  // text on for a text-free style gets text, because that's what
  // "total control" means.
  const textMode =
    settings.text && settings.text !== "auto" ? settings.text
    : template?.noText ? "none"
    : "all";

  const renderable = [`Project name: ${name}`];
  if (textMode === "all") {
    if (bareTicker && showTicker) renderable.push(`Ticker: ${bareTicker}`);
    if (tagline) renderable.push(`Tagline: ${tagline}`);
  }

  // Design-led styles are built around a short line under the name —
  // the layout has a slot for it. When the client hasn't written one,
  // composing it from their own description beats leaving the
  // composition short of the element it is arranged around. Strictly
  // bounded, and it is the ONLY exception to the ban on adding words.
  const writeTagline =
    template?.wantsTagline && textMode === "all" && !tagline && about.length > 0;

  // Text-free runs never receive the copy at all. Handing over the
  // name and then asking for no text is a contradiction the model
  // resolves unpredictably — withholding it is unambiguous. The
  // project details still arrive via the BRIEFING block, so the model
  // knows what it's designing for; it just has no string to letter.
  parts.push(
    textMode === "none"
      ? `TEXT — this banner carries none.

Do not render the project name, the ticker, a tagline, a caption, a label, a watermark, a signature, or any other lettering anywhere in the frame. Not small, not subtle, not tucked into a corner, not integrated into a sign or screen within the scene. The banner communicates through imagery alone. A single legible word is a failed banner.`
      : `TEXT — the only words permitted to appear anywhere on the banner:

${renderable.join("\n")}
${
  writeTagline
    ? `
WRITE THE TAGLINE. The client left it blank, and on this style that is your job rather than a gap to leave. Compose it from the briefing below — at most six words, plain and confident, saying what this project actually is or does. Take it from the substance of the brief, not from adjectives about it.

Set it subordinate to the name but comfortably readable, and place it wherever the composition wants it rather than automatically underneath. No hype, no exclamation, no invented statistics, no claims the briefing does not support. This is the single exception to the rule against adding words; everything else below still applies.
`
    : ""
}
${
  template?.noText
    ? "This style normally carries no text at all, but the client has explicitly asked for it on this banner. Include it, and integrate it so well that it looks like it always belonged. "
    : ""
}${
  textMode === "name"
    ? "Render the project name and nothing else. No ticker, no tagline, no caption, no additional lettering of any kind."
    : writeTagline
    // The paragraph below tells the model the name alone is usually
    // the right answer — sound advice that directly contradicts the
    // instruction, four lines earlier, to write a tagline. Asked for
    // one and then told not to bother, it reliably did not bother.
    ? "Never write the same word twice in different forms: if a ticker repeats the name, abbreviates it, or is built from its initials, the ticker does not appear at all."
    : "Apply the typography rule above: in most cases the project name alone is the right answer. These are available to you, not required of you — use one only where it genuinely strengthens the design, and drop it without hesitation where it doesn't. Never write the same word twice in different forms: if a ticker repeats the name, abbreviates it, or is built from its initials, the ticker does not appear at all."
} Never invent additional words: no slogans, feature lists, badges, percentages, URLs, hashtags, call-to-action buttons or filler labels. A banner carrying one confident name beats one crowded with copy every single time.

LEGIBILITY FLOOR. Every word you do set must be readable at a glance. These banners are seen small — a strip a few centimetres wide on a phone, scrolled past in a second. Supporting lines sit below the name in HIERARCHY, which is a matter of scale, weight and placement — not a licence to set them so fine, so faint, so tightly tracked or so low in contrast that the viewer has to work at them. A subordinate line should still be read without effort. If a line is not worth setting at a readable size, leave it out altogether.`
  );

  parts.push(
    about
      ? `THE PROJECT — what you are designing for:

${about}

THIS IS WHERE THE IDEA COMES FROM. It is the most important input you have been given, and the concept for this banner has to come out of it. Read it for what the thing actually DOES, what it is named after, what it replaces, what using it feels like — then build the banner around that. Someone who knows this project should see the result and recognise it instantly. Someone who has never heard of it should still come away with a sense of what kind of thing it is.

Not a decoration on top of a generic design: the idea IS the design. If you could swap this briefing for a different project's and keep the same banner, you have not used it.

The words themselves never appear. Do not letter them, or paraphrases of them, onto the image — this is a description written FOR you, not copy to place ON it. The words disappear; the idea they describe is the whole piece.`
      : `BRIEFING — context only:

No description was given. Infer the project's world from its name and the uploaded image alone, and commit to your reading of it.`
  );

  // Whatever else changes, the uploaded image is a MARK rather than a
  // character. The failure this flag has always existed to prevent is
  // the logo handed a place to stand: a room, a plinth, a landscape
  // it is posed in.
  //
  // Two forms, because the surrounding prompt differs. A style that
  // still receives the doctrine needs this block to argue with it,
  // and says so explicitly. A solo-brief style has nothing to argue
  // with, so it gets the short form — whose real job is to carry over
  // the one doctrine rule worth keeping: the client's mark must
  // survive as the client's mark. Naming rules that were never sent
  // would only invite the model to imagine them.
  if (template?.graphic) {
    parts.push(
      solo
        ? `THE UPLOADED IMAGE IS THE CLIENT’S BRAND MARK.

It is yours to compose with — place it, scale it, crop it, silhouette it, repeat it, integrate it into a surface, or reduce it to its essential geometry. Environments, landscapes, architecture, materials and cinematic photography are all open to you where the idea calls for them.

Two things it is not. It is not a character to be posed in a scene or stood on a plinth — where such an image appears it is a GROUND the composition is built on, not a habitat the mark lives in. And it is not yours to redesign: however boldly you treat it, what lands on the banner must still be recognisably THEIR mark, not a new one you invented.`
        : `THE UPLOADED IMAGE IS A MARK — this overrides the instruction to build the world around the subject.

Do not read it as a character and build a place for it to live in. It is a brand mark, and it is yours to compose with: place it, scale it, crop it, silhouette it, repeat it, integrate it into a surface, or reduce it to its essential geometry.

This is not a restriction on environments. Landscapes, architecture, materials, photography and cinematic imagery are all fully available to you where the idea calls for them. The distinction is only this: such an image is a GROUND the composition is built on, not a habitat the mark has been posed inside, stood on a plinth in, or otherwise staged within like a figure.

TYPOGRAPHY IS RELEASED FOR THIS STYLE. The general rule that type supports the composition and never dominates it does NOT apply here. Type may BE the artwork: the largest thing in the frame, the whole idea, the only element present. It may equally be almost absent. Both are right answers when the idea asks for them. A single oversized word may run deliberately past the frame as a graphic device — but this is a compositional choice, never an accident, and anything actually meant to be READ must still sit complete and legible inside the canvas.

ASYMMETRY IS RELEASED TOO. The general warning that a subject on one side with emptiness on the other reads as unfinished assumes a scene that needs resolving. It does not apply here. A vast empty field with one small, precisely placed element is a deliberate, finished and frequently superior composition. Do not add anything to balance it.`
    );
  }

  // A restyling style has to explicitly beat the doctrine, which tells
  // the model the subject's STYLE must remain intact. Left to resolve
  // that contradiction itself, it takes the only path satisfying both:
  // preserve the subject exactly and restyle everything around it —
  // which is precisely the failure this names and forbids.
  if (template?.restyle) {
    parts.push(
      `SUBJECT TREATMENT — this overrides the preservation rule stated earlier.

Redraw the subject itself completely in ${template.restyle}. New medium, new line work, new shading, new rendering — the subject must look genuinely drawn in that style, not pasted into it.

What must survive is WHO it is: silhouette, proportions, colour identity, distinguishing features, expression and personality, so that anyone who knows the original recognises it instantly. What must NOT survive is HOW it was originally rendered.

Restyling only the background, or the scene around the subject, while leaving the subject in its original rendering is the single most common failure in this style and counts as a failed banner. The subject and its world must be drawn in one consistent hand.`
    );
  }

  // The mirror of `restyle`, one axis over. That one changes HOW the
  // subject is rendered and holds the camera still; this changes WHERE
  // THE CAMERA IS and holds the rendering still. Both have to beat the
  // same preservation rule in the doctrine, and both fail the same way
  // if they don't: told to move the camera while also told to preserve
  // the subject, the model satisfies both by leaving the subject
  // pasted head-on and moving the scenery behind it.
  //
  // Which is why this says outright that reproducing the attached view
  // is the failure. Without that sentence the safest-looking output —
  // the upload, untouched, on a nicer background — is exactly what
  // comes back, and it is the one result this style must never give.
  if (template?.reangle) {
    parts.push(
      `CAMERA POSITION — this overrides the instruction to preserve the subject's framing and pose.

The attached image is ONE VIEW of this subject, and it is not the view you are drawing. Move the camera. Re-pose and re-draw the subject as it would genuinely appear from the new position — from behind, in profile, from below, from above, from far away, or turned away mid-movement — with surfaces, volumes and details that the attached image does not show worked out honestly from what it does show.

Reproducing the attached pose head-on and changing only the background is a FAILED banner on this style. It is the safe-looking answer and it is the wrong one; the new angle is the entire product.

What must survive is WHO it is, and it must survive completely: species, build, proportions, palette, markings, costume, materials, and the medium the original is drawn in. This is the same character photographed from elsewhere, never a similar character. Identify the two or three features that make this subject recognisable and make sure the angle you have chosen keeps at least one of them clearly in frame.

What must NOT survive is the pose, the orientation, the crop and the distance. Those are yours.`
    );
  }

  if (variantSeasoning) parts.push(variantSeasoning);

  // Explicit user direction sits near the end, after the general
  // guidance it's allowed to override, and returns "" when nothing was
  // touched — so an untouched run produces the identical prompt it
  // always did.
  // AUTO_ID when this is a Default run, NOT the borrowed template's id.
  // Default borrows a template for demo layout data and that template
  // keeps its id — so passing template.id here resolved a Default run
  // against another style's control set. Harmless today, because the
  // picker only ever offers Default the universal controls and the
  // borrowed style's own keys sit at their defaults and emit nothing.
  // It is a trap rather than a bug: one per-style control sharing a key
  // with a universal one, or any future path that merges saved
  // per-style defaults into a Default run, and it starts emitting
  // instructions from a style nobody picked.
  const direction = buildDirection(auto ? AUTO_ID : (template?.id || AUTO_ID), settings);
  if (direction) parts.push(direction);

  // THE CONCEPT — written by the art-director pass (lib/openai.js),
  // one per variant, before any pixel is rendered. This is where the
  // thinking happens now: the image model executes a specific plan
  // instead of averaging toward the most typical banner it knows.
  //
  // Placed AFTER the style and the advanced settings, because it is
  // more specific than either — and BEFORE the client's own direction,
  // which still outranks everything a machine decided.
  if (concept) {
    parts.push(
      `THE CONCEPT FOR THIS PIECE — decided in advance. Execute it:

${concept}

This concept is the assignment, not a suggestion. Do not fall back to a generic composition, and specifically do not fall back to the mark on one side with the name on the other over an empty field. Refine details wherever craft demands, but the idea and the composition described above are what you are building.`
    );
  }

  // WHAT THIS STYLE MAY NOT CONTAIN.
  //
  // Late on purpose. Every item here was already forbidden earlier in
  // the prompt and in the concept pass, and came back anyway — a ban
  // written as prose, a third of the way into a long brief, loses to
  // everything after it. This says the same thing in the position the
  // model actually weights, in the grammar that has been shown to
  // hold: a flat list of nouns, no reasoning, no softener.
  //
  // BEFORE the client's own words, not after, so someone who asks for
  // a circuit board still gets one. That block already declares it
  // outranks the category guidance above it.
  const forbid = template?.forbid;
  if (Array.isArray(forbid) && forbid.length) {
    parts.push(
      `NOT IN THIS PIECE. None of the following may appear anywhere in the image, at any scale, however tastefully rendered:

${forbid.map((f) => `- ${f}`).join("\n")}

These are not discouraged, they are excluded. If the concept above seems to call for one, the concept has been misread — build the same idea without it.`
    );
  }

  // The client's own words, placed last of everything creative.
  //
  // Position is the whole design here. It sits AFTER the style mood
  // and after the advanced settings, because models weight the end of
  // a prompt most heavily and this is the one part of the brief the
  // client wrote specifically about this banner. Where it disagrees
  // with the style, it wins — that is the point of the field.
  //
  // It does NOT sit after FRAMING. "Make the text run off the edge"
  // is a reasonable thing to type and an unusable banner to receive,
  // so the canvas and legibility constraints still land last and
  // still win. Creative direction from the client, technical floor
  // from us.
  if (wants) {
    parts.push(
      `WHAT THE CLIENT ASKED FOR — in their own words:

${wants}

This is a direct instruction about this specific banner, and it is the most important creative input you have been given. Follow it. Where it conflicts with the category guidance above, this wins — they asked for it deliberately, and the category is only a starting point.

Interpret it intelligently rather than literally: they are describing an outcome, not writing a specification, and they may not have the vocabulary for what they mean. If it is brief, treat it as the seed of the concept and build outward with your own judgment rather than doing only the one thing named. It does not override the canvas, framing or legibility requirements below — those are technical, not creative.`
    );
  }

  // Framing goes last, right before the guard rails: it's the hard
  // constraint, and models hold onto the end of a prompt best.
  parts.push(FRAMING);
  parts.push(FORMAT);

  return parts.join("\n\n");
}

// ------------------------------------------------------------
// EDIT PROMPT — for revising a banner the user already likes.
//
// The hard part isn't getting the model to make the change; it's
// stopping it from making the banner WORSE while doing so. The
// banner was composed without the new element in mind, so there is
// frequently nowhere it naturally belongs — and the default
// behaviour is to jam it in anyway: a new line of text stranded
// above the existing one near the top edge, an object floating in
// whatever gap was free, or an empty patch left behind where
// something was removed. All three read as damage.
//
// So this prompt asks for something more demanding than restraint:
// re-solve the same design with the change included. Move, resize
// and re-flow whatever is needed, then rebalance. Identity is what
// must be preserved — subject, palette, style, lighting, type
// personality — not the exact pixel positions.
// ------------------------------------------------------------
export function buildEditPrompt(instruction, { refs = 0 } = {}) {
  const parts = [
    "You are revising a finished banner that the client has already chosen. The current banner is the first attached image.",

    `What they asked for:\n\n"${instruction.trim()}"`,

    "Read that as a desired OUTCOME, not as literal placement instructions. They are telling you what they want to be true of the banner. Working out how to make it true — and where it belongs — is your job, not theirs.",

    `Before changing anything, study the existing design the way a designer would: its alignment and underlying grid, its visual hierarchy, where the eye lands first, how the negative space is distributed, and how the elements balance one another across the full 3:1 width. Then judge honestly whether the requested change can be absorbed without damaging any of that.

Very often it cannot — and anticipating that is the entire point of this step. The banner was composed without this element in mind, so there may simply be no room where it naturally belongs. When that happens, do not force it in. Re-plan the composition so that it fits: move, resize, re-space and re-flow the existing elements as needed, then rebuild the balance around the new arrangement. It is the same design, re-solved to include the new element — not a rearranged pile of the old one.

Never bolt anything on. Do not drop new text directly above or below existing text and leave a line stranded near the top or bottom edge. Do not float an element into whatever gap happened to be free. Do not shrink or crowd something awkwardly to make room. When you are finished, every element — old and new — must look deliberately placed, properly aligned, and part of one intentional layout.

The same discipline applies to removal. Taking something out leaves a hole in the balance, so close it: redistribute the space, re-centre or re-align what remains, and let the composition settle as though the removed element had never existed. Never leave an empty patch where something used to be.`,

    "What must survive: the subject and its identity, the colour palette, the artistic style and rendering technique, the logic of the lighting, the mood, the personality of the typography, and the exact spelling of any text that stays. This is the same banner re-solved, not a fresh interpretation of the brief.",
  ];

  if (refs > 0) {
    parts.push(
      `The ${refs === 1 ? "second attached image is a reference" : `remaining ${refs} attached images are references`} showing what the client has in mind. Use ${refs === 1 ? "it" : "them"} for intent — the subject, object, detail or styling being pointed at — never as artwork to paste in. Re-draw whatever ${refs === 1 ? "it shows" : "they show"} in this banner's own style, palette, lighting, perspective and level of detail, so it reads as though it had been illustrated as part of the original piece. A reference dropped in at its own lighting, its own resolution or its own art style will look pasted on, and that is a failed edit.`
    );
  }

  parts.push(
    "Re-render the complete banner rather than patching it. Do not paste over, blur or smudge the existing image, and leave no seams or artefacts anywhere the design changed.",

    "Match the original's finish exactly. Keep the same level of detail, the same sharpness, the same contrast and the same colour intensity it already has. Do not enhance, sharpen, upscale, add micro-detail, deepen shadows or push saturation — unless the client specifically asked for that. This banner usually sits beside other options from the same run, and an edit that comes back visibly crisper or richer than its siblings no longer looks like the same piece of work.",

    "The bar: someone shown only the result, who never saw the original, should not be able to tell that anything was changed or added. It should look like the banner was designed this way from the very start.",

    FRAMING,
    FORMAT
  );

  return parts.join("\n\n");
}

// Light interpretive nudges so 2–4 variants in one run explore
// different angles instead of near-duplicating each other — never
// literal color/detail knobs, just a different creative lean.
export const VARIANT_SEASONING = [
  "",
  "Take this in a different direction than the obvious first idea — same brief, a fresh angle.",
  "Push this interpretation a little bolder and more confident than the others.",
  "Try a quieter, more restrained take on the same brief.",
];
