// ============================================================
// PFP STYLE METADATA — the part the BROWSER is allowed to see.
//
// Same split, and for the same reason, as lib/styles.js against
// lib/templates.js: names and swatches here where the picker needs
// them, prompts behind `import "server-only"` in lib/pfp.js. A client
// component importing the prompts would ship them in the bundle, and
// a private repo would not help — the leak is the bundle, not the
// source.
//
// FOUR, NOT SEVEN. A profile picture is a much smaller design problem
// than a banner: it is always square, it is almost always just the
// subject, and it is looked at the size of a fingernail. Most of what
// a banner style decides — where the type sits, how the width is
// used, what fills the empty half — does not exist here. So the list
// is short on purpose, and a fifth would have to earn its place by
// producing a genuinely different picture rather than a mood.
// ============================================================

export const PFP_STYLES = [
  {
    id: "default",
    name: "Default",
    tagline: "Cleaned up, kept as it is.",
    accent: "#7C5CFF",
    // The only style that takes a written instruction. The other three
    // ARE the instruction — asking someone what they want on top of
    // "make it anime" invites a second, quieter brief that fights the
    // first. Default has no opinion of its own, which is exactly where
    // one is worth having.
    wants: true,
    // ══ WHICH STYLES CAN KEEP THE GROUND THEY CAME WITH ══
    //
    // The line is not "does this style touch the background" — it is
    // whether the style is DEFINED by replacing it.
    //
    // Default and Glow are not. Default invents a ground because there
    // is usually nothing worth keeping, and Glow is a LIGHTING
    // treatment: you can rim-light a subject standing in a real room
    // and grade that room to match. Both keep working with the
    // original place behind them.
    //
    // Solid is a flat field by definition, and Anime redraws the whole
    // frame in another medium — there is no "the original background"
    // left to keep in either. Offering the toggle there would be
    // offering to switch the style off.
    keepBg: true,
  },
  {
    id: "glow",
    name: "Glow",
    tagline: "Lit from behind.",
    accent: "#4FA8FF",
    keepBg: true,
  },
  {
    id: "solid",
    name: "Solid colour",
    tagline: "One flat colour behind it.",
    accent: "#2FD98B",
    // The only style with a parameter, because it is the only one
    // whose single decision a person can hold an opinion about.
    // Empty means the model chooses, which is the default.
    swatches: [
      { v: "", label: "Auto" },
      { v: "#111418", label: "Black" },
      { v: "#F2F0EB", label: "Bone" },
      { v: "#2451FF", label: "Blue" },
      { v: "#12B981", label: "Green" },
      { v: "#7C5CFF", label: "Purple" },
      { v: "#FF5C8A", label: "Pink" },
      { v: "#FFB020", label: "Amber" },
      { v: "#E4443B", label: "Red" },
    ],
  },
  {
    id: "anime",
    name: "Anime",
    tagline: "Redrawn, still them.",
    accent: "#FF5C8A",
  },
];

// Spread the chosen styles across the options, one each — the same
// helper and the same contract the banner picker uses, so two styles
// with two options gives one of each rather than two of the first.
export { distributeStyles } from "./styles.js";

export const PFP_SIZE = 1024;
// SEVERAL VIEWS OF ONE SUBJECT, not a mood board. One image often
// does not show enough — the face is in one shot, the outfit in
// another, the thing it holds in a third — and the alternative is the
// person picking whichever single frame loses the least.
export const PFP_IMAGES_MAX = 5;
// Two, not four. A profile picture has one correct answer far more
// often than a banner does — there is no layout to explore, so a
// third and fourth option are near-duplicates someone paid for.
export const PFP_MAX = 2;
// A quarter of a banner run, because it is a quarter of the work: one
// image call, no art-director pass, no composition to reason about.
export const PFP_COST = 1;
// A name, a ticker, a handle. Long enough for "$MOONSOON", short
// enough that it cannot become a caption on a 48px circle.
export const PFP_TEXT_MAX = 14;
// Long enough for a real instruction, short enough that it stays an
// instruction rather than becoming a second style brief.
export const PFP_WANTS_MAX = 200;

export function getPfpStyle(id) {
  return PFP_STYLES.find((s) => s.id === id) || PFP_STYLES[0];
}
