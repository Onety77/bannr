// ============================================================
// THE SUITE.
//
// Every one of these is a REGRESSION, not a unit test — each block
// exists because something actually broke, and the comment above it
// says what. They read the real source and, where the thing under
// test is a prompt, build the real prompt with the real module rather
// than searching for a string.
//
// They lived in a scratchpad for months, which meant they would have
// died with the session that wrote them. Two thousand assertions,
// gone, and nobody would have noticed until something quietly
// regressed. They live in the repo now.
//
//   npm test              everything
//   npm test pfp glow     only files whose name contains those
//
// A test that reads a comment instead of code is the failure mode
// here — see `bare()` in most files, which strips comments before
// matching, and the several places where a regex was matching the
// note explaining the rule rather than the rule.
// ============================================================
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const only = process.argv.slice(2).map((s) => s.toLowerCase());
const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".cjs") && f !== "run.cjs")
  .filter((f) => !only.length || only.some((q) => f.toLowerCase().includes(q)))
  .sort();

if (!files.length) {
  console.error(only.length ? `No test files match: ${only.join(", ")}` : "No test files found.");
  process.exit(1);
}

let failed = [];
let passes = 0;

for (const f of files) {
  let out = "";
  let ok = true;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
    ok = false;
  }
  passes += (out.match(/ {2}PASS {2}/g) || []).length;
  const green = /all green/.test(out) && ok;
  console.log(`${green ? "  ok  " : " FAIL "} ${f.replace(".cjs", "")}`);
  if (!green) {
    failed.push(f);
    // Only the failures print their detail. A clean run that dumps
    // two thousand PASS lines is a run nobody reads.
    for (const line of out.split("\n")) {
      if (/FAIL|Error|^\s{2}\d+\./.test(line)) console.log("        " + line.trim());
    }
  }
}

console.log(
  `\n${files.length} files · ${passes} assertions · ` +
    (failed.length ? `${failed.length} FAILED: ${failed.map((f) => f.replace(".cjs", "")).join(", ")}` : "all green")
);
process.exit(failed.length ? 1 : 0);
