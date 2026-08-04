#!/usr/bin/env node
// ============================================================
// CLASH CHECK — the same class setting the same property twice.
//
// Catches one specific bug, because it shipped and took the lightbox
// toolbar off the screen: defining the same single-class rule at the
// top level twice, where the second overwrites properties of the
// first.
//
//   .lb-bar { display: flex; padding: 14px 18px; background: ... }
//   .lb-bar { position: absolute; height: 3px; background: ... }
//
// That is the lightbox's top button bar and an edit progress bar,
// sharing a name by accident. The second won, the toolbar collapsed to
// a 3px strip, and Edit, Undo, Redo, Download and Close were clipped
// out of existence. CSS is legal either way and the build says
// nothing.
//
// IT FLAGS OVERLAPPING PROPERTIES, NOT DUPLICATE SELECTORS. The first
// version flagged any repeated class and found three deliberate ones
// — this stylesheet quite reasonably sets .hero's padding where the
// hero is described and its position where the aurora behind it is —
// which is noise, and a check that cries wolf gets switched off.
// Additive rules pass. Only a genuine overwrite fails.
//
// Skips anything inside @media / @supports, where redefining is the
// whole point, and only looks at exact single-class selectors.
//
//   node scripts/check-css.cjs
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = [path.join(ROOT, "app", "globals.css")];

let failed = false;

for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  // Blank comments out but keep the line count, so reported numbers
  // point at the real line.
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

  const rules = new Map(); // ".foo" -> [{ line, props:Set }]
  let depth = 0, buf = "", line = 1, selLine = 1, selector = null, body = "";

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "\n") line++;

    if (ch === "{") {
      if (depth === 0) {
        selector = buf.trim();
        selLine = line - (buf.match(/\n/g) || []).length;
        body = "";
      }
      depth++;
      buf = "";
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && selector && /^\.[A-Za-z_][\w-]*$/.test(selector)) {
        const props = new Set(
          [...body.matchAll(/(^|;)\s*([-a-zA-Z]+)\s*:/g)].map((m) => m[2].toLowerCase())
        );
        if (!rules.has(selector)) rules.set(selector, []);
        rules.get(selector).push({ line: selLine, props });
      }
      if (depth === 0) { selector = null; body = ""; }
      buf = "";
      continue;
    }
    if (depth === 1) body += ch;
    if (depth === 0) buf += ch;
  }

  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const clashes = [];
  for (const [cls, list] of rules) {
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const both = [...list[a].props].filter((p) => list[b].props.has(p));
        if (both.length) clashes.push({ cls, a: list[a].line, b: list[b].line, both });
      }
    }
  }

  if (!clashes.length) {
    console.log(`check-css: clean (${rel}, ${rules.size} top-level class rules)`);
    continue;
  }
  failed = true;
  console.error("check-css: the same class sets the same property twice\n");
  for (const c of clashes) {
    console.error(`  ${c.cls}  —  ${rel}:${c.a} and :${c.b}`);
    console.error(`    both set: ${c.both.join(", ")}`);
    console.error(`    the later rule wins; if that was not the intent, rename one\n`);
  }
}

process.exit(failed ? 1 : 0);
