// ============================================================
// ADVANCED SETTINGS — per-style overrides.
//
// Somewhere to put "this user, this run" without touching the
// doctrine. Every fix that goes into lib/templates.js applies to
// everyone forever; these apply to one generation.
//
// THE RULE THIS IS BUILT ON: every control defaults to "auto", and
// auto contributes NOTHING to the prompt. A user who never opens
// the panel gets byte-identical prompts to one built with no
// settings at all. The moment a default starts emitting text, every
// generation is quietly constrained and the MANDATE — "you are the
// designer in charge, don't wait for permission" — stops working.
// There is a test for this; keep it passing.
//
// Sliders are labelled presets wearing a slider's clothes. A model
// cannot act on "density: 37", so each stop is a written
// instruction, tuned like the style briefs are. Five stops, not a
// hundred, because each one is copy someone has to write well.
//
// `structural: true` marks controls that change WHICH COPY IS SENT
// rather than adding prose — buildPrompt handles those directly and
// buildDirection skips them. It is also what keeps a control out of
// multi-select; see isMulti below.
//
// MOST CONTROLS TAKE SEVERAL ANSWERS. "Show me dark, light and vibrant
// in one run" is the normal thing to want from a list of options, and
// picks spread one per option rather than one per run. Which controls
// that applies to is derived from their shape, not declared per
// control — again, see isMulti.
// ============================================================

import { distributeStyles } from "./styles.js";

// ---------- universal: offered on every style ----------
export const UNIVERSAL = [
  {
    key: "text",
    label: "Text",
    structural: true,
    help: "Overrides the style's own default, including on styles that normally carry none.",
    options: [
      { v: "auto", label: "Default" },
      { v: "all", label: "Name + ticker + tagline" },
      { v: "name", label: "Name only" },
      { v: "none", label: "No text at all" },
    ],
  },
  {
    key: "ticker",
    label: "Ticker",
    structural: true,
    help: "Auto hides it when it just restates the name (MOONSOON, MSN, CWB).",
    options: [
      { v: "auto", label: "Default" },
      { v: "always", label: "Always show" },
      { v: "never", label: "Never show" },
    ],
  },
  {
    key: "placement",
    label: "Text placement",
    options: [
      { v: "auto", label: "Default" },
      { v: "left", label: "Left", prompt: "Anchor the lettering to the left of the frame and balance the right side with the subject or the environment." },
      { v: "right", label: "Right", prompt: "Anchor the lettering to the right of the frame and balance the left side with the subject or the environment." },
      { v: "center", label: "Centre", prompt: "Centre the lettering horizontally and build the composition symmetrically around it." },
      { v: "behind", label: "Behind subject", prompt: "Set the lettering behind the subject so the subject partially overlaps and occludes it, giving the composition real depth. Keep enough of each word visible to stay readable." },
      { v: "split", label: "Split across frame", prompt: "Split the lettering across the frame — part on one side, part on the other, or wrapped around the subject — so both halves of the banner carry weight." },
      { v: "edge", label: "Along an edge", prompt: "Run the lettering along one edge of the frame, set small and confident, as a designed margin rather than a headline." },
    ],
  },
  {
    key: "treatment",
    label: "Text treatment",
    options: [
      { v: "auto", label: "Default" },
      { v: "quiet", label: "Understated", prompt: "Set the type quietly: a well-chosen typeface at a modest size, clean weight, at most a soft shadow to lift it from the background. No outlines, no extrusion, no glow, no texture, no oversized display weight." },
      { v: "bold", label: "Bold and dramatic", prompt: "Give the type real presence — large, confident, and expressively styled, treated as a major compositional element rather than a label. Keep it beautifully crafted rather than merely loud." },
    ],
  },
  {
    key: "density",
    label: "Simplicity → richness",
    type: "scale",
    stops: [
      { label: "Bare", prompt: "Strip the composition to its absolute essentials. Very few elements, generous negative space, no decorative additions whatsoever. The restraint must read as deliberate and confident — expensive, not empty." },
      { label: "Spare", prompt: "Keep the composition spare and uncluttered. A small number of considered elements, plenty of breathing room, nothing present that isn't doing work." },
      { label: "Balanced", prompt: "Keep the composition measured — enough detail to feel crafted, enough space to feel calm, with a clear hierarchy between subject and surroundings." },
      { label: "Rich", prompt: "Build a richer, more layered scene: a fuller environment, more supporting detail and texture, more happening in the frame — while keeping one clear focal point." },
      { label: "Maximal", prompt: "Fill the frame with density and detail — a dense, immersive, layered world with texture and incident everywhere. It must stay composed and readable rather than chaotic, with the subject still unmistakably the focus." },
    ],
  },
  {
    key: "scale",
    label: "Subject scale",
    options: [
      { v: "auto", label: "Default" },
      { v: "subtle", label: "Subtle", prompt: "Let the subject sit modestly within the frame, smaller than instinct suggests, with the environment carrying much of the composition." },
      { v: "dominant", label: "Dominant", prompt: "Let the subject dominate the frame, large and close, occupying much of the composition." },
    ],
  },
  {
    key: "palette",
    label: "Palette",
    options: [
      { v: "auto", label: "Default" },
      { v: "logo", label: "Take from the logo", prompt: "Derive the entire colour palette from the uploaded image — its own hues, extended into a coherent scheme for the whole banner." },
      { v: "dark", label: "Dark", prompt: "Build the banner on a dark ground — deep, low-key values throughout, lit selectively." },
      { v: "light", label: "Light", prompt: "Build the banner on a light ground — bright, airy, high-key values throughout." },
      { v: "vibrant", label: "Vibrant", prompt: "Use a saturated, high-energy palette with confident colour contrast." },
      { v: "muted", label: "Muted", prompt: "Use a restrained, desaturated palette — soft, tonal, and understated." },
      { v: "mono", label: "Monochrome", prompt: "Work in a single hue across the whole banner, carried by value and tone rather than by colour variety." },
    ],
  },
  {
    key: "avoid",
    label: "Avoid",
    type: "text",
    placeholder: "e.g. no people, no gradients, nothing religious…",
    // Written as a hard constraint: this is the one control where the
    // user is telling us what a failure looks like.
    prompt: (v) => `Do not include any of the following, under any interpretation: ${v}. This is a hard constraint — a banner containing any of it has failed regardless of how good it otherwise looks.`,
  },
];

// ---------- per style ----------
export const PER_STYLE = {
  // POV's whole product is the camera position, so the one thing a user
  // will want to override is which shot they get. Left on Default the
  // director picks per option and these emit nothing, as everywhere.
  //
  // Every prompt here is phrased to beat the model's strongest instinct
  // on this style — reproduce the upload and change the background —
  // by describing the subject's POSITION relative to camera, not the
  // scenery. "Behind the subject" alone gets read as "put the camera
  // behind the scenery"; "we see its back" cannot be.
  pov: [
    {
      key: "shot",
      label: "Shot",
      help: "Where the camera stands. This is the whole style, so it is the one worth picking several of.",
      // ══ EACH OPTION IS A LENS, NOT A LABEL ══
      //
      // "Shoot it from above" is a direction; it is not a photograph,
      // and a renderer handed only the direction returns the flat,
      // deadly-even map view that makes a high angle look like a
      // mistake. What separates every one of these from its own worst
      // version is optical: focal length, aperture, and where the
      // light is. So each names all three, in that order.
      options: [
        { v: "auto", label: "Default" },
        { v: "behind", label: "From behind", prompt: "Place the camera behind the subject: we see its back, and it is facing away from us into the scene, looking at whatever it is looking at. Do not show its face — turn the head only slightly, and only where that is what keeps the subject recognisable. Shoot it on a medium telephoto so the distance stacks up in compressed layers behind the subject rather than falling away. Hold focus on the subject and let the far distance soften through haze and aerial perspective rather than through defocus — the thing it is looking at has to stay legible or the shot has no subject. Light it from ahead and low, so the subject reads mainly as a dark shape with the source separating its top edge and shoulders from what lies beyond." },
        { v: "profile", label: "Profile", prompt: "Shoot the subject from the side — the full profile, edge-on, not a three-quarter view and not the front. Treat it as a portrait: a long portrait lens at a wide aperture, the near edge of the face or body critically sharp, the background thrown well out of focus into soft tonal shapes with no readable detail. Keep the camera level with the subject rather than above it. Light it from the front-side so the profile line is defined against a darker ground, with the far side of the form falling into shadow — the outline is the whole picture, so nothing behind it may cross it at the same brightness." },
        { v: "low", label: "Low angle", prompt: "Put the camera on the ground, below the subject, looking up. Use a wide lens close in, so the subject looms over the viewer, the verticals splay slightly outward toward the top of the frame, and whatever is overhead — sky, canopy, ceiling, weather — becomes a large part of the composition. Keep the focus deep so both the subject and what is above it hold. Light it from above and behind so the top edges catch and the underside stays heavy; the ground immediately in front of the lens should fall dark, which is what makes the subject rise." },
        { v: "high", label: "High angle", prompt: "Put the camera above the subject and looking down at an angle — never straight down, which flattens the picture into a map and is the failure this shot is prone to. Use a moderately wide lens so the ground plane recedes and curves away toward a horizon or an edge, giving the frame real depth instead of an even field. The subject sits off-centre with the surface it stands on running away behind it. Stop down and keep the focus deep — the receding plane is doing the work of depth here and has to stay sharp along its whole length; a blurred background on this shot flattens the very thing that was giving it dimension. Light it low and raking from one side so the subject casts a long shadow across that surface — the shadow is what gives a top-down subject volume, and without it the shot reads flat however well composed." },
        { v: "far", label: "Far away", prompt: "Place the camera a long way off and shoot on a long telephoto. The compression is the point: the world behind the subject rises up as a huge soft wall rather than receding, and the subject sits small and sharp against it. Let atmosphere between camera and subject lift the distant tones so separation comes from contrast rather than detail. The subject reads by silhouette and must sit at the point of highest contrast in the frame — small is a decision, but a subject that has to be hunted for has failed. Light it from behind or the side so its outline separates cleanly from the mass behind it." },
        { v: "close", label: "Close on a detail", prompt: "Move the camera in until one characteristic part of the subject fills the frame — an eye, a hand, a paw, an ear, an edge, a worn surface — cropped hard by the frame with the rest of the subject implied beyond it. Shoot it close-focus at a wide aperture: one plane critically sharp and everything in front of and behind it falling away fast. Rake the light across the surface at a shallow angle so texture and material read — fibre, grain, fur, chipped paint, brushed metal. Frontal light kills this shot." },
        { v: "quarter", label: "Three-quarter turn", prompt: "Turn the subject roughly halfway between facing us and facing away, caught looking off-frame at something we are not shown. Shoot it on a normal-to-short-telephoto lens at eye level, close to how a person standing there would see it, with moderate depth of field — the subject resolved, the setting present but secondary. Light it three-quarters from the side it is turning toward, so the leading edge of the form is lit and the side nearer the camera falls gently into shadow. This is the most forgiving angle for likeness; use the room that gives you to make the setting specific." },
        { v: "moving", label: "Mid-movement", prompt: "Catch the subject in motion — walking into frame, walking out of it, turning, mid-stride — as though the camera was already running and this is one frame of it. Shoot at a shutter slow enough that the ground, the air or the trailing limbs carry a little blur while the subject's mass stays readable, or pan with it so the background streaks and the subject holds. Leave space in the direction of travel rather than behind it. Light it from the side it is moving toward, so it is walking into the light." },
      ],
    },
    {
      key: "looking",
      label: "What it faces",
      help: "Only bites on shots where the subject is turned away.",
      options: [
        { v: "auto", label: "Default" },
        { v: "vista", label: "A vast landscape", prompt: "What the subject is facing is a wide landscape opening out in front of it — the scale of what it is looking at is the point of the shot." },
        { v: "light", label: "A light source", prompt: "What the subject is facing is the source of light in the scene, so it is rimmed from the front and reads mostly as a dark shape to us." },
        { v: "city", label: "A city or structure", prompt: "What the subject is facing is a built thing — a skyline, a structure, a lit interior — standing away from it at a distance." },
        { v: "away", label: "Nothing in particular", prompt: "The subject is facing out of the frame at something we are not shown. Leave what it is looking at undefined and let the empty space carry it." },
      ],
    },
  ],

  glow: [
    {
      key: "glowStrength",
      label: "Glow intensity",
      type: "scale",
      stops: [
        { label: "Whisper", prompt: "Keep the glow extremely restrained — barely more than a hint of separation between subject and background." },
        { label: "Soft", prompt: "Keep the glow soft and subtle, present but never the first thing noticed." },
        { label: "Balanced", prompt: "Let the glow read clearly as a deliberate lighting choice without dominating the frame." },
        { label: "Strong", prompt: "Let the glow be a major presence in the image, strongly shaping the mood and the light of the whole scene." },
        { label: "Radiant", prompt: "Make the light the defining feature of the banner — powerful and enveloping, with the subject reading against it. It must still resolve as considered cinematic lighting, never an undifferentiated wash of bloom." },
      ],
    },
    {
      key: "glowSource",
      label: "Light source",
      options: [
        { v: "auto", label: "Default" },
        { v: "behind", label: "Behind subject", prompt: "Place the light source directly behind the subject so it rims the silhouette and separates it from the background." },
        { v: "rim", label: "Edge / rim light", prompt: "Light the subject from the side with a defined rim along one edge, leaving the opposite side in shadow." },
        { v: "ambient", label: "Ambient wash", prompt: "Let the light come from the environment itself as a soft ambient wash rather than a single identifiable source." },
        { v: "below", label: "From below", prompt: "Light the subject from below, letting the glow rise up into the scene." },
      ],
    },
  ],

  collectibles: [
    {
      key: "arrangement",
      label: "Arrangement",
      options: [
        { v: "auto", label: "Default" },
        { v: "grid", label: "Grid", prompt: "Compose the set as an ordered arrangement of panels — a deliberate grid, designed as part of the artwork. Vary the grid itself rather than defaulting to equal rectangles: unequal cells, a hero panel among smaller ones, staggered rows, a strip, columns of different widths, panels rotated a few degrees off-square. The grid is a composition, not a spreadsheet." },
        // The strongly-worded override is deliberate: the style mood
        // is written around panels, and a polite suggestion loses to
        // it. This has to beat the mood, so it says it is doing so.
        { v: "freeform", label: "Free-form", prompt: "Abandon panels entirely — this overrides the panel-based layout described earlier. No panels, no compartments, no borders, no dividers, no frames of any kind. Compose the variations as one free-form ensemble instead: the same character in its different outfits and roles, placed across the canvas however the poses fit together best — clustered, leaning, back-to-back, slightly overlapping, or spaced apart — like a cast lineup or a spill of figures arranged by hand. One shared ground, one coherent composition, still reading instantly as many versions of one identical character. If a panel count was chosen, deliver that many FIGURES rather than panels." },
      ],
    },
    {
      key: "panels",
      label: "Panels",
      options: [
        { v: "auto", label: "Default" },
        { v: "4", label: "4", prompt: "Compose the set as exactly 4 panels." },
        { v: "6", label: "6", prompt: "Compose the set as exactly 6 panels." },
        { v: "8", label: "8", prompt: "Compose the set as exactly 8 panels." },
        { v: "10", label: "10", prompt: "Compose the set as exactly 10 panels." },
        { v: "many", label: "12+", prompt: "Compose the set as twelve or more panels, densely packed like a full sticker sheet, while keeping every variation legible." },
      ],
    },
    {
      key: "dividers",
      label: "Dividers",
      options: [
        { v: "auto", label: "Default" },
        // Each of these names a FAMILY and asks for one member of it,
        // not a single fixed look. A control that describes exactly one
        // treatment produces exactly one treatment, forever — which is
        // how every hand-cut banner ended up as white polaroid borders
        // on white, and every grid as thin white lines. The style's art
        // director picks the specific member per option; this is the
        // constraint it picks within.
        { v: "none", label: "None", prompt: "Use no dividers or borders at all — the variations sit directly on one shared ground, separated by spacing alone. That ground is a design decision in its own right: kraft paper, dark velvet, newsprint, a painted backdrop, worn cardboard, graph paper, a flat brand colour. Choose one and commit." },
        { v: "thin", label: "Thin lines", prompt: "Separate the panels with fine, precise dividing lines. Decide what those lines ARE rather than defaulting to plain white: hairline rules in ink, embossed creases, thread, dotted perforations like a stamp sheet, engraved keylines, a fine metallic rule. The ground behind them is a decision too — it does not have to be white." },
        { v: "thick", label: "Thick borders", prompt: "Give each panel a heavy, confident border. Decide what that border is made of rather than defaulting to a plain white frame: a bold ink outline, a die-cut sticker's raised white edge, comic-panel gutters, a painted frame, chunky risograph blocks, a thick foil rule. The ground behind them is a decision too." },
        { v: "rounded", label: "Rounded cards", prompt: "Present each variation on its own rounded card. Decide what kind of card: a trading card with a printed border, a rounded sticker with a die-cut edge, a Polaroid, an app-icon squircle, a boxed blind-bag window, a rounded enamel pin. Lay them out with real care and pick a ground that suits them." },
        { v: "handcut", label: "Hand-cut", prompt: "The edges are MADE BY HAND, not ruled. Pick ONE hand-made edge treatment for this banner and commit to it completely — do not blend several. The family includes: torn paper with visible fibres; scissor-cut edges that wobble and tilt; a brush-inked frame with a loaded, varying line; deckle-edged photo paper; perforated stamp borders; taped photo corners; a cut-and-paste zine collage with visible overlap and shadow; hand-drawn pencil boxes that do not quite close. Choose the one this particular subject suits and execute it with total confidence — the imperfection must read as deliberate craft, made by someone who could have drawn it straight and chose not to, never as sloppiness. The ground behind is part of the choice: kraft, newsprint, sketchbook, dark card, colour — it does not have to be white." },
      ],
    },
    {
      key: "variance",
      label: "Variation range",
      options: [
        { v: "auto", label: "Default" },
        { v: "tight", label: "Subtle", prompt: "Keep the variations close to one another — small, tasteful changes of accessory or expression rather than dramatic reinvention." },
        { v: "wide", label: "Wild", prompt: "Push the variations as far apart as possible — wildly different roles, settings, costumes and jokes across the set, while the subject itself stays exactly consistent." },
      ],
    },
  ],

  anime: [
    {
      key: "era",
      label: "Look",
      options: [
        { v: "auto", label: "Default" },
        { v: "modern", label: "Modern film", prompt: "Render in the style of a contemporary anime feature film — polished digital colour, atmospheric lighting, cinematic depth." },
        { v: "cel", label: "90s cel", prompt: "Render in the style of hand-painted 1990s cel animation — visible paint, slightly grainy film character, period-accurate colour." },
        { v: "watercolor", label: "Soft watercolour", prompt: "Render with soft watercolour backgrounds and gentle, painterly edges." },
        { v: "manga", label: "Manga ink", prompt: "Render as high-contrast manga illustration — strong ink line work, screentone texture, restrained colour." },
      ],
    },
    {
      key: "lines",
      label: "Line weight",
      options: [
        { v: "auto", label: "Default" },
        { v: "fine", label: "Fine", prompt: "Use delicate, fine line work throughout." },
        { v: "bold", label: "Bold", prompt: "Use bold, confident line work with strong weight variation." },
      ],
    },
  ],

  him: [
    {
      key: "framing",
      label: "Framing",
      options: [
        { v: "auto", label: "Default" },
        { v: "close", label: "Close", prompt: "Frame tight on the subject so it fills most of the height of the banner." },
        { v: "medium", label: "Medium", prompt: "Frame the subject at medium distance with a clear but contained surrounding space." },
        { v: "wide", label: "Wide", prompt: "Frame wide, letting the subject sit within a larger environment while still commanding it." },
      ],
    },
    {
      key: "mood",
      label: "Mood",
      options: [
        { v: "auto", label: "Default" },
        { v: "calm", label: "Calm", prompt: "Keep the mood serene and composed — stillness as the source of authority." },
        { v: "imposing", label: "Imposing", prompt: "Make the mood commanding and slightly intimidating — scale, shadow and low angle used to project power." },
        { v: "warm", label: "Warm", prompt: "Keep the mood warm and approachable while retaining presence and confidence." },
      ],
    },
  ],

  meme: [
    {
      key: "humor",
      label: "Dry → absurd",
      type: "scale",
      stops: [
        { label: "Deadpan", prompt: "Play the joke completely straight — the humour comes from how seriously the absurd premise is treated." },
        { label: "Dry", prompt: "Keep the humour understated and wry rather than broad." },
        { label: "Playful", prompt: "Let the humour be clear and good-natured without becoming slapstick." },
        { label: "Loud", prompt: "Push the comedy hard — big expressions, bold situations, obvious energy." },
        { label: "Unhinged", prompt: "Go fully absurd — surreal, chaotic, gleefully over the top — while keeping the craft and composition genuinely excellent." },
      ],
    },
  ],

  // Replaced the old "Material" control, which offered glass /
  // concrete / metal / paper / displays and whose every option began
  // "Build the scene from...". That was written for a Tech style that
  // rendered product mockups. This style composes rather than renders,
  // so picking a substance for a scene that no longer exists was both
  // meaningless and actively misleading to the model.
  //
  // What is worth a dial here is how far from convention the client
  // wants the composition pushed — the one axis where taste genuinely
  // differs from project to project.
  tech: [
    {
      key: "invention",
      label: "Convention → invention",
      type: "scale",
      stops: [
        { label: "Classic", prompt: "Keep the composition classical and safe: a clear, conventional arrangement executed impeccably. This is a client who wants to look established rather than surprising, so the craft carries the piece and the layout does not draw attention to itself." },
        { label: "Measured", prompt: "Keep the composition familiar but well judged — a recognisable arrangement with one considered decision that lifts it above the default." },
        { label: "Considered", prompt: "Build the composition around a genuine idea specific to this project, resolved with confidence. Neither conservative nor showy." },
        { label: "Inventive", prompt: "Push the composition somewhere unexpected. Break the obvious arrangement deliberately — unusual placement, dramatic scale contrast, type used structurally rather than as a label. It must still look designed and intentional, never merely unusual." },
        { label: "Radical", prompt: "Take a real risk with the composition. Extreme negative space, extreme crops, type fractured across the frame, the mark used at a scale or position nobody would expect. The result must remain unmistakably professional and beautifully crafted — this is a design studio being brave, not an experiment going wrong." },
      ],
    },
  ],
};

// Every control that applies to a given style, universal first.
export function controlsFor(styleId) {
  return [...UNIVERSAL, ...(PER_STYLE[styleId] || [])];
}

// A control's untouched value. Scales use -1 rather than a middle
// stop so that "no opinion" is representable — a slider parked at
// "Balanced" would still be an instruction.
export function defaultValue(control) {
  if (isMulti(control)) return [];
  if (control.type === "scale") return -1;
  if (control.type === "text") return "";
  return "auto";
}

export function isDefault(control, value) {
  if (isMulti(control)) return !picked(value).length;
  return value === undefined || value === defaultValue(control);
}

// ------------------------------------------------------------
// WHICH CONTROLS TAKE SEVERAL ANSWERS.
//
// Derived, not declared. "Show me dark, light and vibrant in one run"
// is the normal thing to want from every list of options, not a
// special case of the camera — so this is the default and the
// interesting decision is where it must NOT apply.
//
// Three exclusions, and each is a real failure rather than a taste
// call:
//
//   structural — `text` and `ticker` do not add prose, they change
//   WHICH COPY IS SENT. A run that is text-free on one option and
//   fully lettered on the next is not a variation of one banner set,
//   it is two different products; and buildPrompt resolves them into
//   whole blocks that contradict each other ("this banner carries
//   none" beside the name it must letter). This is the case that was
//   flagged, and it is excluded by rule rather than by memory.
//
//   scale — a slider's stops are a single axis from less to more.
//   "Bare AND Maximal" is not two options, it is no opinion, and the
//   -1 default already expresses that.
//
//   text — a free-text Avoid is a hard constraint. Applying it to
//   some options and not others means asking for the thing you just
//   said would make the banner a failure.
//
// `single: true` opts a future list control out without touching this
// rule. There is a guard below that keeps the three exclusions from
// being overridden the other way.
// ------------------------------------------------------------
export function isMulti(control) {
  if (!control || control.single) return false;
  return !control.structural && control.type !== "scale" && control.type !== "text";
}

if (process.env.NODE_ENV !== "production") {
  for (const [styleId, list] of [["*", UNIVERSAL], ...Object.entries(PER_STYLE)]) {
    for (const c of list) {
      if (c.multi !== undefined) {
        throw new Error(`Control "${c.key}" on ${styleId} sets multi — it is derived from the control's shape now, not declared. Use \`single: true\` to opt out.`);
      }
      if (isMulti(c) && !Array.isArray(c.options)) {
        throw new Error(`Control "${c.key}" on ${styleId} is multi but has no options to choose from.`);
      }
    }
  }
}

// The real selections on a multi control, tolerant of everything that
// can arrive here: undefined from an old saved draft, a bare string
// from a client on the previous build, "auto" left in the array by a
// deselect-to-nothing, or JSON posted by hand.
export function picked(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(raw.filter((v) => typeof v === "string" && v && v !== "auto"))];
}

// ------------------------------------------------------------
// SPREADING A MULTI CONTROL ACROSS THE OPTIONS.
//
// The contract is the same one distributeStyles has, and it is the
// same helper, because the two are the same problem one level down:
// N choices, M slots, spread evenly, earliest-chosen takes the
// remainder. Sharing it is what stops the preview on /create from
// disagreeing with what the server actually renders — the bug this
// codebase has already paid for once with styles.
//
// Everything downstream (buildDirection, the prompt, the concept
// pass) sees an ordinary single-valued settings object, so nothing
// else in the pipeline had to learn what a multi control is.
// ------------------------------------------------------------
export function spreadSettings(styleId, settings = {}, nth = 0, total = 1) {
  const out = { ...settings };
  for (const c of controlsFor(styleId)) {
    if (!isMulti(c)) continue;
    const chosen = picked(settings[c.key]);
    if (!chosen.length) { out[c.key] = "auto"; continue; }
    out[c.key] = distributeStyles(chosen, Math.max(total, 1))[nth] || chosen[0];
  }
  return out;
}

// The label each option will carry, in order — "Far away", "Profile",
// "High angle". Empty strings where nothing multi was chosen, so the
// caller can decide whether to show a second line at all.
export function optionLabels(styleId, settings = {}, total = 1) {
  // Style-specific controls read first: on POV the shot is the headline
  // and the palette is a modifier of it, so "Far away · Dark" is the
  // right way round and controlsFor's universal-first order is not.
  const ordered = [...(PER_STYLE[styleId] || []), ...UNIVERSAL];
  return Array.from({ length: Math.max(total, 1) }, (_, i) => {
    const one = spreadSettings(styleId, settings, i, total);
    return ordered
      // Only where the answers actually DIFFER between options. One
      // pick applies to every banner, so labelling it per option would
      // be noise claiming to be information.
      .filter((c) => isMulti(c) && picked(settings[c.key]).length > 1)
      .map((c) => c.options.find((o) => o.v === one[c.key])?.label)
      .filter(Boolean)
      .join(" · ");
  });
}

// How many controls the user has actually moved — drives the badge on
// the style card so an expanded-then-collapsed panel isn't invisible.
export function countTouched(styleId, settings = {}) {
  return controlsFor(styleId).filter((c) => !isDefault(c, settings[c.key])).length;
}

export function multiKeys(styleId) {
  return controlsFor(styleId).filter(isMulti).map((c) => c.key);
}

// ------------------------------------------------------------
// THE SPLIT THE CONCEPT PASS NEEDS.
//
// The director writes all of a style's concepts in one call, so it
// has to be told which of the client's settings apply to every option
// and which differ between them. Getting that wrong in either
// direction costs something real:
//
//   A run asking for three different shots must not be told all three
//   concepts are the first one — which is what a single buildDirection
//   call on an unresolved multi value would say.
//
//   And a setting the client gave ONE answer to is not per-option at
//   all: it is a standing constraint on the whole run, and belongs in
//   the shared brief once rather than repeated identically under every
//   concept number. "Concept 1: dark. Concept 2: dark. Concept 3:
//   dark." reads as three decisions where there was one.
//
// So the line is drawn at whether the answers actually VARY — the
// same test optionLabels uses to decide whether an option is worth
// labelling.
// ------------------------------------------------------------
function varies(settings, key) {
  return picked(settings[key]).length > 1;
}

export function sharedSettings(styleId, settings = {}) {
  const out = { ...settings };
  for (const k of multiKeys(styleId)) {
    if (varies(settings, k)) out[k] = "auto";
    else out[k] = picked(settings[k])[0] || "auto";
  }
  return out;
}

// The prose for the controls that DIFFER between options, bare — no
// header, because it lands inside a numbered assignment list rather
// than standing on its own. `settings` is the client's original, which
// is the only thing that can say whether a value varied or was simply
// chosen once for the whole run.
export function optionDirection(styleId, resolved = {}, settings = resolved) {
  const out = [];
  for (const c of controlsFor(styleId)) {
    if (!isMulti(c) || !varies(settings, c.key)) continue;
    const v = Array.isArray(resolved[c.key]) ? picked(resolved[c.key])[0] : resolved[c.key];
    const opt = c.options.find((o) => o.v === v);
    if (opt?.prompt) out.push(opt.prompt);
  }
  return out.join(" ");
}

// Turn settings into prompt prose. Returns "" when nothing is set,
// which is the whole contract: untouched settings change nothing.
export function buildDirection(styleId, settings = {}) {
  const lines = [];
  for (const c of controlsFor(styleId)) {
    const v = settings[c.key];
    if (isDefault(c, v)) continue;
    if (c.structural) continue; // handled by buildPrompt, not as prose

    if (c.type === "scale") {
      const stop = c.stops[v];
      if (stop) lines.push(stop.prompt);
    } else if (c.type === "text") {
      const s = String(v).trim().slice(0, 300);
      if (s) lines.push(c.prompt(s));
    } else {
      // A multi control should already have been resolved to one value
      // by spreadSettings. Taking the first is a safety net for a path
      // that forgot to — better one real shot than a prompt asking for
      // three cameras at once.
      const one = isMulti(c) ? picked(v)[0] : v;
      const opt = c.options.find((o) => o.v === one);
      if (opt?.prompt) lines.push(opt.prompt);
    }
  }
  if (!lines.length) return "";
  return `SPECIFIC DIRECTION for this banner — the client has asked for these explicitly, so they take precedence over the general guidance above wherever the two disagree:\n\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}`;
}
