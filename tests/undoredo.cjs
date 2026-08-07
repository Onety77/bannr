// Simulates the undo/redo state machine using the REAL pushPast pulled
// from the page, with the same transitions the component performs.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const C = fs.readFileSync(R + "app/create/page.jsx", "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

function grab(src, sig) {
  const i = src.indexOf(sig);
  let j = src.indexOf("(", i), p = 0;
  for (; j < src.length; j++) { if (src[j] === "(") p++; else if (src[j] === ")") { p--; if (!p) break; } }
  let d = 0, st = false;
  for (; j < src.length; j++) { if (src[j] === "{") { d++; st = true; } else if (src[j] === "}") { d--; if (st && !d) return src.slice(i, j + 1); } }
}
const EDIT_HISTORY = Number(C.match(/const EDIT_HISTORY = (\d+);/)[1]);
const pushPast = new Function("EDIT_HISTORY", grab(C, "function pushPast") + "\nreturn pushPast;")(EDIT_HISTORY);

// The transitions, mirroring the component.
const frameOf = (v) => ({ dataUrl: v.dataUrl, bg: v.bg, concept: v.concept, edits: v.edits || 0 });

const applyEdit = (v, label) => ({
  ...v, dataUrl: label, concept: v.concept, edits: (v.edits || 0) + 1,
  past: pushPast(v, frameOf(v)), future: [],
});
const reroll = (v, label, concept) => ({
  ...v, dataUrl: label, concept, edits: 0,
  past: pushPast(v, frameOf(v)), future: [],
});
const undo = (v) => {
  if (!v.past?.length) return v;
  const past = [...v.past];
  const frame = past.pop();
  const edits = frame.edits != null ? frame.edits : (past.length ? Math.max(0, (v.edits || 0) - 1) : 0);
  return { ...v, dataUrl: frame.dataUrl, concept: frame.concept, past, edits,
           future: [frameOf(v), ...(v.future || [])] };
};
const redo = (v) => {
  if (!v.future?.length) return v;
  const future = [...v.future];
  const frame = future.shift();
  const past = pushPast(v, frameOf(v));
  return { ...v, dataUrl: frame.dataUrl, concept: frame.concept, past, future,
           edits: frame.edits ?? v.edits ?? 0 };
};
const revert = (v) => ({ ...v, dataUrl: v.past[0].dataUrl, concept: v.past[0].concept, past: [], future: [], edits: 0 });

const start = () => ({ dataUrl: "ORIG", concept: "c0", edits: 0, past: [], future: [] });

console.log("\n1. THE ROUND TRIP");
{
  let v = start();
  v = applyEdit(v, "e1");
  const atE1 = v.dataUrl;
  v = undo(v);
  ok(v.dataUrl === "ORIG" && v.edits === 0, "undo lands on the original");
  ok(v.future.length === 1, "and the new version is held for redo");
  v = redo(v);
  ok(v.dataUrl === atE1 && v.edits === 1, "redo returns to exactly where you were");
  ok(v.future.length === 0, "nothing left ahead");
  ok(v.past.length === 1, "and the original is behind you again");
}

console.log("\n2. DEEP ROUND TRIP");
{
  let v = start();
  for (const n of ["e1", "e2", "e3"]) v = applyEdit(v, n);
  const top = v.dataUrl, topEdits = v.edits;
  for (let i = 0; i < 3; i++) v = undo(v);
  ok(v.dataUrl === "ORIG", "three undos reach the original");
  ok(v.future.length === 3, "all three are held");
  for (let i = 0; i < 3; i++) v = redo(v);
  ok(v.dataUrl === top && v.edits === topEdits, "three redos come all the way back (edits=" + v.edits + ")");
}

console.log("\n3. UNDO/REDO IS STABLE UNDER TOGGLING");
{
  let v = start();
  v = applyEdit(v, "e1");
  // undo,redo,undo,redo,undo,redo — ends on a redo, so it lands back
  // where it started. The point is that the stacks do not corrupt or
  // grow while it happens.
  for (let i = 0; i < 6; i++) v = i % 2 === 0 ? undo(v) : redo(v);
  ok(v.dataUrl === "e1", "toggling six times returns to the starting version");
  ok(v.past.length === 1 && v.future.length === 0, "stacks are exactly as they began (" + v.past.length + "+" + v.future.length + ")");
  // And one more undo still works after all that.
  v = undo(v);
  ok(v.dataUrl === "ORIG" && v.future.length === 1, "and undo still behaves afterwards");
}

console.log("\n4. A NEW ACTION BRANCHES");
{
  let v = start();
  v = applyEdit(v, "e1");
  v = applyEdit(v, "e2");
  v = undo(v);
  ok(v.future.length === 1 && v.dataUrl === "e1", "sitting on e1 with e2 ahead");
  v = applyEdit(v, "e3");
  ok(v.future.length === 0, "a new edit discards what was ahead");
  ok(v.past[v.past.length - 1].dataUrl === "e1", "and e1 is what undo now returns to");
}
{
  let v = start();
  v = applyEdit(v, "e1");
  v = undo(v);
  v = reroll(v, "r1", "c-new");
  ok(v.future.length === 0, "a reroll discards what was ahead too");
}

console.log("\n5. THE CONCEPT TRAVELS WITH ITS PICTURE");
{
  let v = start();
  v = reroll(v, "r1", "c-reroll");
  ok(v.concept === "c-reroll", "reroll brings a new concept");
  v = undo(v);
  ok(v.dataUrl === "ORIG" && v.concept === "c0", "undo restores the ORIGINAL concept with the original art");
  v = redo(v);
  ok(v.dataUrl === "r1" && v.concept === "c-reroll", "redo brings the rerolled concept back with it");
}

console.log("\n6. REVERT ENDS EVERYTHING");
{
  let v = start();
  for (const n of ["e1", "e2"]) v = applyEdit(v, n);
  v = undo(v);
  v = revert(v);
  ok(v.dataUrl === "ORIG" && v.edits === 0, "revert lands on the original");
  ok(v.past.length === 0 && v.future.length === 0, "with nothing in either direction");
}

console.log("\n7. THE CAP STILL PROTECTS THE ORIGINAL");
{
  let v = start();
  for (let i = 1; i <= 10; i++) v = applyEdit(v, "e" + i);
  ok(v.past.length === EDIT_HISTORY, "past capped at " + EDIT_HISTORY);
  ok(v.past[0].dataUrl === "ORIG", "index 0 is still the original after 10 edits");
  while (v.past.length) v = undo(v);
  ok(v.dataUrl === "ORIG" && v.edits === 0, "undoing to the end reaches it, labelled correctly");
}

console.log("\n8. THE SOURCE USES THESE EXACT TRANSITIONS");
ok(C.includes("const future = [{ dataUrl: v.dataUrl, bg: v.bg, concept: v.concept, edits: v.edits || 0 }, ...(v.future || [])];"), "undo builds the forward frame as simulated");
ok(C.includes("const frame = future.shift();"), "redo takes from the front");
ok(C.includes("restoreFrame(idx, frame, past, frame.edits ?? v.edits ?? 0, future);"), "redo restores the frame's own edit count");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
