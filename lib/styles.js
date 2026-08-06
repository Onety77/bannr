// ============================================================
// STYLE METADATA — the part of a style the BROWSER is allowed to see.
//
// This file exists because of a leak. lib/templates.js holds the
// prompts, and it was imported by client components for nothing more
// than style names and thumbnails — which put every mood string into
// the public JavaScript bundle. Anyone could open devtools on the live
// site and read the entire creative direction for all six styles.
// A private repo would not have helped: the leak was the bundle, not
// the source.
//
// So the split is: names, taglines, colours and thumbnails here, where
// the picker needs them; the prompts stay behind `import "server-only"`
// in lib/templates.js, which now fails the BUILD if a client component
// ever imports it again. Not a convention — a compiler error.
//
// Nothing in this file should ever describe how a banner is made.
// ============================================================

export const AUTO_ID = "auto";
export const AUTO_NAME = "Default";

export const STYLES = [
  { id: "tech", name: "Tek", tagline: "Authored, not assembled.", accent: "#2451FF", thumb: "tech.jpg" },
  { id: "meme", name: "Meme", tagline: "The joke, told visually.", accent: "#FFB020", thumb: "meme.jpg" },
  { id: "him", name: "HIM", tagline: "Pure presence. Owns the frame.", accent: "#E4593B", thumb: "him.jpg" },
  { id: "pov", name: "POV", tagline: "The angle you never shot.", accent: "#0FBFD4", thumb: "pov.jpg" },
  { id: "glow", name: "Glow", tagline: "Backlit. The edge does the work.", accent: "#7C5CFF", thumb: "glow.jpg" },
  { id: "anime", name: "Anime", tagline: "Official key visual, not a filter.", accent: "#FF5C8A", thumb: "anime.jpg" },
  { id: "collectibles", name: "Collectibles", tagline: "One subject, many variants.", accent: "#2FD98B", thumb: "collectibles.jpg" },
];

// ------------------------------------------------------------
// SLOT ARITHMETIC — how many of the run's options a given style gets.
//
// Needed once a style could carry several shots at once: "pick as many
// as you have options" is only honest if something can say how many
// that actually is, and the answer is not obvious. Two styles across
// four options is 2 and 2 — never 3 and 1 — because distributeStyles
// splits evenly. So a POV run sharing the frame with one other style
// can show two shots at most, and telling someone that up front beats
// silently dropping their third pick.
//
// All three derive from distributeStyles rather than reimplementing
// its arithmetic, so they cannot drift from what actually renders.
// ------------------------------------------------------------
export function slotsFor(ids, id, count) {
  return distributeStyles(ids, Math.max(count, ids.length)).filter((s) => s === id).length;
}

// The most this style can ever receive, given the run's ceiling.
export function maxSlotsFor(ids, id, max = 4) {
  return slotsFor(ids, id, Math.max(max, ids.length));
}

// The smallest option count at which this style receives n of them.
// Returns the ceiling when n is unreachable, so a caller that bumps
// the count always lands somewhere valid.
export function optionsForSlots(ids, id, n, max = 4) {
  const top = Math.max(max, ids.length);
  for (let c = ids.length; c <= top; c++) if (slotsFor(ids, id, c) >= n) return c;
  return top;
}

export function distributeStyles(ids, count) {
  if (!ids.length) return [];
  const per = Math.floor(count / ids.length);
  let extra = count % ids.length;
  const out = [];
  for (const id of ids) {
    const n = per + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    for (let k = 0; k < n; k++) out.push(id);
  }
  return out.slice(0, count);
}
