#!/usr/bin/env node
// ============================================================
// HANDLER CHECK — a function that takes an argument, wired
// straight to an event.
//
//   <button onClick={importCA}>
//
// React calls that with the click event, so the first parameter —
// which the author meant to be an address, an id, a mode — arrives as
// a SyntheticEvent. It is not null, so `arg ?? fallback` does not
// catch it. `String(event)` is "[object Object]".
//
// That shipped. The Fetch button on /create passed `importCA` bare,
// every address typed into it became "[object Object]", failed the
// shape check, and reported "That doesn't look like a contract
// address" — so it read as a broken address validator rather than a
// broken button, and survived because the paste path called the same
// function correctly and worked fine.
//
// The fix is always the same shape: onClick={() => importCA()}.
//
// THREE THINGS KEEP IT QUIET, because a check that cries wolf gets
// switched off — the first draft of this flagged nine call sites and
// eight were correct.
//
//   1. Only REAL DOM EVENTS. `onLike={like}` is a custom prop and its
//      contract is between a parent and a child — FeedCard calls
//      `onLike(post)` deliberately, and nothing here can know that.
//   2. Only when the first parameter is NOT event-named. `e`, `ev`,
//      `event` are the author saying "position one is the event",
//      which is exactly right for `onSubmit={save}` where save calls
//      preventDefault. `addressArg` is the author saying it is not.
//   3. Only functions declared in the same file. An imported or
//      passed-in handler is not ours to judge.
//
//   node scripts/check-handlers.cjs
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components"];

// React's DOM events. Anything else spelled onSomething is a prop the
// component invented, and its arguments are its own business.
const DOM_EVENTS = new Set([
  "onClick", "onDoubleClick", "onChange", "onInput", "onSubmit", "onReset",
  "onFocus", "onBlur", "onKeyDown", "onKeyUp", "onKeyPress",
  "onMouseDown", "onMouseUp", "onMouseEnter", "onMouseLeave", "onMouseMove", "onMouseOver", "onMouseOut",
  "onPointerDown", "onPointerUp", "onPointerMove", "onPointerEnter", "onPointerLeave", "onPointerCancel",
  "onTouchStart", "onTouchEnd", "onTouchMove", "onTouchCancel",
  "onPaste", "onCopy", "onCut", "onScroll", "onWheel",
  "onDragStart", "onDragEnd", "onDragOver", "onDrop", "onDragEnter", "onDragLeave",
  "onLoad", "onError", "onEnded", "onPlay", "onPause", "onCanPlay", "onAnimationEnd", "onTransitionEnd",
  "onContextMenu", "onSelect", "onToggle",
]);

// The author's way of saying "this parameter is the event".
const EVENT_PARAM = /^(e|ev|evt|event|_e|_)$/;

const BARE = /\b(on[A-Z][A-Za-z]*)=\{([A-Za-z_$][\w$]*)\}/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// The name of `name`'s first parameter, or null when it takes none
// and undefined when it is not declared in this file at all. Handles
// `function f(a)` plus the arrow and function-expression forms.
function firstParam(src, name) {
  const esc = name.replace(/\$/g, "\\$");
  const pats = [
    new RegExp(`function\\s+${esc}\\s*\\(([^)]*)\\)`),
    new RegExp(`(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`),
    new RegExp(`(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s*)?function\\s*\\(([^)]*)\\)`),
    // Single-parameter arrow without parentheses: const f = e => …
    new RegExp(`(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s*)?([A-Za-z_$][\\w$]*)\\s*=>`),
  ];
  for (const re of pats) {
    const m = src.match(re);
    if (!m) continue;
    const params = m[1].trim();
    if (!params) return null;
    // First parameter only, and stripped of a default value.
    return params.split(",")[0].split("=")[0].trim();
  }
  return undefined; // not declared here — an import or a prop, not ours to judge
}

// Blank comments out but keep the line count, so reported numbers
// point at the real line. The fix for this very bug is documented in
// a comment that quotes the broken form.
function decomment(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^([^\n]*?)\/\/[^\n]*$/gm, (m, keep) => keep + " ".repeat(m.length - keep.length));
}

const hits = [];
for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const src = decomment(raw);
    for (const m of src.matchAll(BARE)) {
      const [text, prop, name] = m;
      if (!DOM_EVENTS.has(prop)) continue;
      const param = firstParam(src, name);
      if (!param) continue;              // takes nothing, or not declared here
      if (EVENT_PARAM.test(param)) continue; // the event is what it wanted
      const line = src.slice(0, m.index).split("\n").length;
      hits.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        line, name, param, text,
      });
    }
  }
}

if (!hits.length) {
  console.log("check-handlers: clean (no argument-taking function wired straight to an event)");
  process.exit(0);
}

console.error("check-handlers: a function expecting data is wired straight to an event\n");
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  ${h.text}`);
  console.error(`    ${h.name}(${h.param}) — React passes the EVENT as ${h.param}`);
  console.error(`    write  ${h.text.replace(`{${h.name}}`, `{() => ${h.name}()}`)}\n`);
}
process.exit(1);
