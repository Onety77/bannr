// ============================================================
// STYLE REFERENCES — showing the model the standard, not the answer.
//
// Some styles cannot be reached by description alone. Tech is the
// clearest case: every prose rewrite either produced a house layout or
// drifted into generic futurism, because "brand-grade design work" is
// a quality you recognise instantly and can barely define. Showing is
// the only reliable way to set that bar.
//
// WHAT THESE ARE NOT: content. Nothing in a reference belongs in the
// banner — not its layout, its subject, its palette, its type or its
// words. They carry one thing, the STANDARD, and the prompt in
// lib/openai.js is emphatic about that. A reference set used as
// content would replace one house layout with a nicer house layout,
// which is the exact failure this is trying to end.
//
// NOT IN public/. Everything under public/ is served to anyone who
// asks. This set is other people's work collected as a bar to clear,
// and it is a real part of what makes the output good — neither of
// those belongs on a public URL.
//
// ROTATION is why it does not converge. Each variant in a run gets a
// DIFFERENT slice of the set, so four options in one run are pulled
// toward four different examples rather than all toward the same one.
// With a set of eight and three shown at a time, that is a lot of
// distinct combinations from a small folder.
//
// COST is why they are downscaled. A reference is read for
// composition, hierarchy and craft, none of which need full
// resolution — 640px wide is plenty and costs a fraction of what the
// original would.
// ============================================================
import "server-only";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "references");
const EXT = /\.(jpe?g|png|webp)$/i;

// How wide a reference is sent at. Big enough to read a layout, small
// enough that adding three of them is not the dominant cost of a run.
const REF_WIDTH = 640;

// How many ride along per variant. More is not better: past a handful
// the model starts averaging them, and averaged design is exactly the
// beige middle this is meant to escape.
export const REFS_PER_VARIANT = 3;

// Loaded once per process, not once per request. Reading and
// re-encoding the same files on every generation would add latency to
// the one path where latency is already the complaint.
const cache = new Map();

async function load(styleId) {
  if (cache.has(styleId)) return cache.get(styleId);

  let encoded = [];
  try {
    const dir = path.join(DIR, styleId);
    const names = (await fs.readdir(dir)).filter((n) => EXT.test(n)).sort();
    encoded = await Promise.all(
      names.map(async (name) => {
        const buf = await fs.readFile(path.join(dir, name));
        const small = await sharp(buf)
          .resize({ width: REF_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: 74 })
          .toBuffer();
        return small.toString("base64");
      })
    );
  } catch {
    // No folder, no readable files, anything at all: this is an
    // enhancement, and a style that cannot find its references must
    // still generate exactly as it did before.
    encoded = [];
  }

  cache.set(styleId, encoded);
  return encoded;
}

// The slice this particular variant sees.
//
// Offset by `seed` so variant 0 and variant 1 in the same run start at
// different points in the set. Wraps, so a folder smaller than
// REFS_PER_VARIANT still works — it just repeats, which is correct:
// two references are better than none.
export async function styleReferences(styleId, seed = 0) {
  const all = await load(styleId);
  if (!all.length) return [];

  const take = Math.min(REFS_PER_VARIANT, all.length);
  const start = ((seed % all.length) + all.length) % all.length;
  return Array.from({ length: take }, (_, i) => all[(start + i) % all.length]);
}

// For the admin page and for knowing whether a style has any at all,
// without paying to encode them.
export async function referenceCount(styleId) {
  return (await load(styleId)).length;
}

// Only for tests and for a dev who has just dropped new files in and
// does not want to restart the server.
export function clearReferenceCache() {
  cache.clear();
}
