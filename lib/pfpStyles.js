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
    // The ground is invented here, so there is a real choice about
    // whether to invent it at all. Glow and Solid ARE their grounds —
    // offering to keep the original on those is offering to turn the
    // style off, which is what picking a different style is for.
    keepBg: true,
  },
  {
    id: "glow",
    name: "Glow",
    tagline: "Lit from behind.",
    accent: "#4FA8FF",
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
    keepBg: true,
  },
];

// Spread the chosen styles across the options, one each — the same
// helper and the same contract the banner picker uses, so two styles
// with two options gives one of each rather than two of the first.
export { distributeStyles } from "./styles.js";

export const PFP_SIZE = 1024;
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

export function getPfpStyle(id) {
  return PFP_STYLES.find((s) => s.id === id) || PFP_STYLES[0];
}
