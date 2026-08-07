// ============================================================
// THE PFP MAKER — a much smaller problem than a banner, with one
// much sharper failure.
//
// A banner is a design problem: composition, typography, what fills
// the width. A profile picture is not. It is square, it is almost
// always just the subject, and it is looked at the size of a
// fingernail beside a name. There is no layout to invent.
//
// ══ SO THE WHOLE JOB IS FIDELITY, AND THE STAKES ARE UNUSUAL ══
//
// If a banner comes back a little different from what someone had in
// mind, they reroll it. If a PFP comes back with a different face,
// the project cannot use it at all — their community knows that
// picture, it is the one on every post, and an avatar that is nearly
// right is worthless. Nobody says "close enough" about the thing
// their token is recognised by. So every style here except the one
// that exists to redraw carries the same instruction, and it is
// stated as the failure rather than as a preference.
//
// ══ AND THE INPUT IS USUALLY A SCREENSHOT ══
//
// This is the part that decides whether the product works. People do
// not arrive with a clean asset on a transparent background; they
// arrive with a phone screenshot of a TikTok or an X post. Portrait,
// compressed, and covered in furniture: a username, a caption, like
// and comment counts, a progress bar, a play triangle, the carrier
// and battery in the status bar, a Follow button, burned-in
// subtitles.
//
// A model handed that and asked for "a profile picture" will happily
// return the screenshot cropped square, chrome and all — because
// that IS the image it was shown. Everything below exists to make it
// do the two things the person actually wanted and could not
// articulate: find the subject inside the frame, and throw the
// interface away.
// ============================================================
import "server-only";
import { PFP_SIZE, PFP_TEXT_MAX, getPfpStyle } from "./pfpStyles.js";

export { PFP_SIZE, getPfpStyle };
export { PFP_STYLES, PFP_MAX, PFP_COST, PFP_TEXT_MAX, distributeStyles } from "./pfpStyles.js";

// ------------------------------------------------------------
// READING THE SOURCE.
//
// Deliberately does NOT ask "is this a screenshot?" as a yes/no. A
// model asked to classify first and act second frequently decides it
// is not one and skips the cleanup, and the cases that matter are the
// ambiguous ones — a photo of a phone, a meme with a watermark, a
// video still with one line of subtitle left in.
//
// So the interface list is unconditional. On a clean upload there is
// nothing to remove and the block costs nothing; on a screenshot it
// is the entire value.
// ------------------------------------------------------------
const SOURCE = `WHAT YOU HAVE BEEN GIVEN. The attached image is whatever the client had to hand, and it is usually not a clean asset. Expect a phone screenshot: a portrait video still or a social post, compressed and soft, with the app's interface sitting on top of the picture.

FIND THE SUBJECT INSIDE IT. Look past the frame and decide what this image is actually OF — the character, the creature, the person, the mascot, the object it is about. That subject is the entire content of the profile picture you are making. If two or three belong together and are clearly the point of the picture, keep them together as one group; if one is plainly the subject and the rest is background, crowd or incidental, keep the one.

NONE OF THE INTERFACE SURVIVES. Remove every part of the image that belongs to the app rather than to the picture, and remove it completely rather than blurring, covering or cropping around it:

- usernames, @handles, display names, captions, descriptions, hashtags
- like, comment, share, bookmark and view counts, and their icons
- play and pause triangles, progress and seek bars, timestamps, duration labels
- Follow and Subscribe buttons, verification ticks, profile bubbles
- the phone's own status bar — clock, battery, signal, carrier, notch, home indicator
- burned-in subtitles, auto-captions, sticker text, watermarks, app logos
- borders, letterbox bars and any frame around the picture

The finished image must not contain one readable letter, digit, icon or fragment of a bar from any of that. A profile picture with a like count in the corner is a failed profile picture, however good the subject looks.`;

// ------------------------------------------------------------
// THE RULE THE PRODUCT RESTS ON.
//
// Written as the consequence rather than the instruction, because
// "preserve the subject" is a sentence every prompt contains and no
// model weighs heavily. What it is competing against is the model's
// own instinct to improve — to tidy a wonky drawing, straighten a
// crooked eye, smooth a bad render — and that instinct has to be
// named as the thing going wrong, or it reads as good work.
// ------------------------------------------------------------
const FIDELITY = `IT MUST STILL BE THEM, AND THIS IS THE ONE THING THAT CANNOT BE GOT WRONG.

The client's community already knows this character. It is on every post they have made. An avatar that is ALMOST right is worth nothing to them — they will not use it, because the thing a profile picture does is be recognised instantly by people who have seen it a hundred times.

So carry the subject over exactly: the same face, the same proportions, the same colours, the same markings, the same expression, the same accessories, the same drawing or rendering style it already has. Anything covering or attached to it — a hat, glasses, a chain, a cigarette, headphones, a hoodie — is part of who it is and stays.

DO NOT IMPROVE IT. This is the instinct to resist, because it does not feel like a mistake while you are making it. Do not straighten a crooked feature, tidy a rough drawing, prettify a face, correct proportions you think are off, refine a cheap 3D render, or make it more conventionally appealing. Its flaws are its identity. If it is a badly drawn frog, the answer is that same badly drawn frog, clean and sharp — not a better frog.

You may repair the MEDIUM, never the subject: compression blocking, JPEG artefacts, blur, noise and low resolution are damage from the screenshot and should be resolved away, so the result is crisp at full size. That is sharpening a photograph, not redrawing what it shows.`;

// ------------------------------------------------------------
// SQUARE, AND SMALL.
//
// Two separate facts that both get forgotten. The source is portrait,
// so something has to give — and the wrong answer, letterboxing, is
// the one a model reaches for when told "make it square" without
// being told what square means here.
//
// The second half is the part nobody prompts for and every good
// avatar obeys. These are looked at as a 32px circle in a chart
// sidebar. A composition that is correct at full size and mush at
// thumbnail has failed at the only size that matters.
// ------------------------------------------------------------
const FRAME = `THE FRAME IS A PERFECT SQUARE, and the source almost certainly is not.

Re-frame it. Do not letterbox, do not pad with bars, do not sit a portrait rectangle inside a square with strips down the sides. Move in on the subject and build the square around it, extending or replacing whatever sits behind so the ground fills the frame edge to edge.

THE SUBJECT IS LARGE IN THE FRAME. Fill it: head and shoulders, or the whole of a small object, sitting central and generous with only a modest margin. A subject stranded small in the middle of a square is the most common bad avatar there is.

IT WILL BE SEEN AS A CIRCLE THE SIZE OF A FINGERNAIL. Every platform this is for crops it round and shows it at about forty pixels beside a name. So compose for that: keep what identifies the subject — the face, the silhouette, the one distinctive marking — well inside the circle that a square crop leaves, and keep nothing important in the corners, which are cut off. Strong separation between the subject and the ground, so the shape reads at a glance. Fine detail, thin lines and subtle gradients disappear entirely at that size and should not be what the picture depends on.`;

// ------------------------------------------------------------
// THE STYLES.
//
// Four, and only one of them is allowed to touch the subject.
//
// Glow is written from the same hard lesson the banner Glow cost: a
// glow chased away from "neon outline" becomes a thin crisp rim,
// which is a sticker. The softness has to be the headline, and the
// falloff has to be permitted explicitly, or the model draws a line
// around the character and calls it light.
// ------------------------------------------------------------
const STYLES = {
  default: `TREATMENT — read the subject and make the right call yourself.

There is no house look to apply here. Look at what the subject actually is — a hand-drawn frog, a 3D render, a photographed pet, a crocheted plushie, a pixel sprite — and give it the background and light that a designer would choose for that specific thing. A flat colour, a soft gradient, a gentle vignette, a quiet studio backdrop, a simple environment implied rather than described. Whatever makes THIS subject read cleanly.

Restraint is the whole style. No scene, no props, no story, no effects, nothing behind the subject competing for the eye. If someone describes the result afterwards they should describe the character and nothing else.`,

  glow: `TREATMENT — the subject is lit from behind, and the light is the style.

A band of warm or cool light gathers along the subject's contour where a source set behind it catches the silhouette, and lifts it off a dark ground.

IT IS SOFT. This is the single decision that separates a glow from an outline. The band has no hard boundary: brightest right on the contour, falling away into the form over a short distance, and carrying a little into the air just beyond the edge so the light and the background meet without a seam. If you could trace where it stops with a pen, it has stopped being light and become a stroke. Thin, crisp and even is a sticker; soft, gathered and uneven is light.

It is uneven. Brightest where the surface turns away toward the source, thinning as the form rolls back toward the viewer, fading out where the silhouette faces away. Never a band of even weight running the whole way round.

The ground stays dark and plain so the edge has something to be seen against, and the subject's own face and front stay readable — underlit rather than lost. No second light competing, no haze filling the frame, no halo floating around the subject as a separate shape with a gap between, no neon line drawn on afterwards.`,

  solid: `TREATMENT — the subject on one flat colour, and nothing else.

Cut the subject cleanly out of whatever it was in and place it on a single solid field of colour. Completely flat: no gradient, no texture, no pattern, no vignette, no lighting falloff across it, no second colour. One colour, edge to edge, behind the subject.

The cut has to be clean and complete. No fringe of the old background clinging to the edges, no halo, no soft grey ghost of what was there, and no drop shadow unless the subject would otherwise blend into the field. Fur, hair and fine edges stay soft and natural rather than being cut with a hard line through them.

The subject keeps its own lighting and rendering. This changes what is BEHIND it, not what it is.`,

  anime: `TREATMENT — redraw the subject as anime, and this style is the one exception to the rule above about not redrawing it.

Draw it in high-quality modern anime illustration: clean confident line work, flat cel shading with defined shadow shapes, rich but controlled colour, the look of an official character render rather than a filter laid over a photograph.

WHAT MUST SURVIVE IS WHO IT IS. Silhouette, proportions, colour identity, markings, expression, personality and every accessory it wears, so that anyone who knows the original recognises it immediately. What must NOT survive is how it was originally rendered — a subject left in its source rendering against an anime background is the failure this style produces when it is done half way.

Behind it: a simple, quiet ground in the same hand — a flat colour, a soft gradient, a suggestion of light. Not a scene.`,
};

// ------------------------------------------------------------
// TEXT, WHICH IS OFF UNLESS ASKED FOR.
//
// A profile picture with a word on it is usually worse than one
// without, and the size is why: at forty pixels a name is a smudge
// across a face. But people do ask for it — a ticker, a handle — and
// refusing outright would be us deciding for them.
//
// So it is available, bounded, and told where it may not go. The
// bound is the useful part: without a length the field invites a
// sentence, and a sentence at avatar size is a grey bar.
// ------------------------------------------------------------
function textBlock(text) {
  if (!text) {
    return `NO TEXT. There is no lettering anywhere in this image — no name, no ticker, no handle, no caption, no watermark, no signature, no letters or digits worked into the background or the subject. Not small, not subtle, not tucked into a corner. A single readable word is a failed profile picture.`;
  }
  return `ONE PIECE OF TEXT, and this exact string: ${text}

Set it once. Nothing else is written anywhere in the image — no second line, no invented words, no handle, no decoration spelled out.

It must not cross the subject's face or cover anything that identifies it. Put it along the bottom, or curved with the frame, or tucked into a corner of the ground where there is room. Set it in a clean bold face at a size that stays readable in a forty-pixel circle, which means large and simple, with enough contrast against what sits behind it to be read without effort. No thin weights, no script faces, no outlines, no bevel, no chrome, no glow, no long shadow.

Remember the crop: platforms cut this square into a circle, so no part of any letter may sit near a corner or hard against an edge, or it will be sliced off.`;
}

// ------------------------------------------------------------
// One call, no art-director pass — unlike a banner, where the whole
// diversity problem lives in a text model. There is nothing to
// ideate: the composition is decided (subject, square, large), the
// content is decided (whatever they uploaded), and paying for a
// reasoning call to say so would add latency and a failure mode to
// buy nothing.
// ------------------------------------------------------------
// ------------------------------------------------------------
// KEEPING THE GROUND IT CAME WITH.
//
// Only offered on the styles that invent one. It is not a variant of
// the interface cleanup and must not read as one: the app furniture
// goes either way, and what is being kept is the actual place — the
// room, the street, the sky the subject was photographed against.
// ------------------------------------------------------------
const KEEP_BG = `KEEP THE BACKGROUND IT CAME WITH. Do not invent a new setting, a studio backdrop or a flat field. Whatever the subject is actually standing in — the room, the street, the sky, the surface behind it — stays, and is extended outward where the square needs more of it than the source had.

This is not permission to keep the interface. Everything listed above still goes: the overlays, the buttons, the counters, the bars, the captions. What survives is the PLACE, cleaned of everything that was sitting on top of it, resolved up out of its compression and pushed gently back so the subject still reads first.`;

export function buildPfpPrompt(styleId, { text = "", color = "", keepBg = false } = {}) {
  const style = getPfpStyle(styleId);
  const clean = String(text || "").trim().slice(0, PFP_TEXT_MAX);

  let treatment = STYLES[style.id] || STYLES.default;
  if (keepBg && style.keepBg) treatment += `\n\n${KEEP_BG}`;
  if (style.id === "solid") {
    treatment += color
      ? `\n\nThe colour is chosen and it is ${color}. Use that exact colour for the field, unmodified.`
      : `\n\nThe colour is yours to choose. Read the subject and pick one that makes it stand out hardest — usually a colour drawn from its own palette but shifted well away in value, or a clean complementary. Avoid a colour so close to the subject's own that the silhouette stops reading.`;
  }

  return [
    `Make a profile picture — a square avatar for a crypto project, to be used on DEX Screener, X and Telegram.`,
    SOURCE,
    FIDELITY,
    treatment,
    FRAME,
    // Last, because models weight the end of a prompt and these are
    // the two rules whose violation makes the image unusable rather
    // than merely worse.
    textBlock(clean),
    `FINALLY, AND OVER EVERYTHING ABOVE: the subject must be recognisably the one in the attached image, and no part of any app interface, screenshot furniture or unrequested lettering may appear anywhere in the result.`,
  ].join("\n\n");
}
