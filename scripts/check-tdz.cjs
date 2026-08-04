#!/usr/bin/env node
// ============================================================
// TEMPORAL DEAD ZONE CHECK
//
// Catches one specific bug, because it happened and the build did not
// notice: a statement in a component body reading a `const` that is
// declared further down the same body.
//
//   const editProgress = useProgress(busy, 28_000);   <- line 50
//   const [busy, setBusy] = useState(false);          <- line 55
//
// That builds cleanly, ships, and throws "Cannot access 'busy' before
// initialization" the moment the component renders. It took /create
// down in production while every other page kept working, because
// /create was the only page rendering that component.
//
// DELIBERATELY NARROW, and narrow in four specific ways, because the
// first version produced 28 false positives and a check that cries
// wolf gets switched off:
//
//   1. Only statements at the function's own indentation, which run
//      top to bottom during render. Anything nested is fine — it is
//      called later, by which time everything exists.
//   2. Scope resets at every top-level function, so one function's
//      parameter is never confused with another's local.
//   3. Comments and string literals are stripped first. Otherwise
//      params.get("ca") "uses" a variable called ca.
//   4. Property accesses are ignored. brief.ticker is not the local
//      variable ticker.
//
// ESLint's no-use-before-define does this properly and should replace
// this the moment ESLint is added. This is the cheap version of the
// one rule that has actually cost us an outage.
//
//   node scripts/check-tdz.cjs
// ============================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib"];

const files = [];
for (const d of DIRS) {
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (/node_modules|\.next/.test(p)) continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(f)) files.push(p);
    }
  })(path.join(ROOT, d));
}

// Strip what is not code: line comments, then string and template
// literals. Both routinely contain words that look like identifiers.
function code(line) {
  return line
    .replace(/\/\/.*$/, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function declaredNames(line) {
  const m = line.match(/^\s*(?:const|let)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/);
  if (!m) return [];
  const head = m[1];
  if (head.startsWith("[") || head.startsWith("{")) {
    return head
      .slice(1, -1)
      .split(",")
      .map((s) => s.split(":").pop().replace(/\.\.\./, "").trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
  }
  return [head];
}

// A new top-level function starts a new scope.
const NEW_SCOPE = /^(export\s+)?(default\s+)?(async\s+)?function\s|^(export\s+)?(const|let)\s+[\w$]+\s*=\s*(async\s*)?\(|^(export\s+)?(const|let)\s+[\w$]+\s*=\s*(async\s+)?function/;

const findings = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");

  let scope = [];
  const flushScope = () => {
    const at = new Map();
    scope.forEach((d) => d.names.forEach((n) => { if (!at.has(n)) at.set(n, d.i); }));
    for (const d of scope) {
      const eq = d.src.indexOf("=");
      if (eq < 0) continue;
      // Ignore anything reached through a dot: brief.ticker is not ticker.
      const init = d.src.slice(eq + 1).replace(/\.\s*[A-Za-z_$][\w$]*/g, "");
      for (const m of init.matchAll(/[A-Za-z_$][\w$]*/g)) {
        const name = m[0];
        const decl = at.get(name);
        if (decl === undefined || decl <= d.i) continue;
        if (d.names.includes(name)) continue;
        findings.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          line: d.i + 1,
          name,
          declaredAt: decl + 1,
          text: lines[d.i].trim(),
        });
      }
    }
    scope = [];
  };

  lines.forEach((raw, i) => {
    const c = code(raw);
    if (NEW_SCOPE.test(c)) flushScope();
    if (!/^ {2}(const|let)\s/.test(c)) return;
    const names = declaredNames(c);
    if (names.length) scope.push({ i, names, src: c });
  });
  flushScope();
}

if (!findings.length) {
  console.log(`check-tdz: clean (${files.length} files)`);
  process.exit(0);
}

console.error("check-tdz: reads a const before it is declared\n");
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.text}`);
  console.error(`    "${f.name}" is not declared until line ${f.declaredAt}\n`);
}
process.exit(1);
