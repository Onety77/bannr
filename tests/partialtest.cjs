const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const U = fs.readFileSync(R + "lib/users.js", "utf8").replace(/\r\n/g, "\n");
const S = fs.readFileSync(R + "app/api/generate/route.js", "utf8").replace(/\r\n/g, "\n");
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
// The real shipped function, not a copy.
const f = new Function("GENERATION_COST",
  grab(U, "export function partialRefundCredits").replace(/^export /, "") + "\nreturn partialRefundCredits;")(3);

console.log("\n1. THE ARITHMETIC (a run costs 3 credits)");
ok(f(0, 4) === 0, "nothing missing -> no refund");
ok(f(1, 4) === 1, "4 asked, 1 lost -> 1 back (pay 2 for 3)");
ok(f(2, 4) === 2, "4 asked, 2 lost -> 2 back (pay 1 for 2)");
ok(f(3, 4) === 2, "4 asked, 3 lost -> 2 back, NOT 3 (pay 1 for 1)");
ok(f(1, 3) === 1, "3 asked, 1 lost -> 1 back");
ok(f(2, 3) === 2, "3 asked, 2 lost -> 2 back");
ok(f(1, 2) === 2, "2 asked, 1 lost -> 2 back (pay 1 for 1)");
ok(f(4, 4) === 3, "total failure -> the full 3");
ok(f(9, 4) === 3, "never refunds more than the run cost");
ok(f(-1, 4) === 0 && f(1, 0) === 0, "nonsense inputs refund nothing");
let floor = true;
for (let a = 2; a <= 4; a++) for (let m = 1; m < a; m++) if (f(m, a) > 2) floor = false;
ok(floor, "a run that delivered ANYTHING always costs at least 1 credit");

console.log("\n2. THE ROUTE");
ok(S.includes("const missing = attempted - results.length;"), "counts what did not arrive");
ok(
  S.indexOf("await refundCredits(charged.accountId, refunded)") <
  S.indexOf("const after = demoMode ? null : await getUser"),
  "refunds BEFORE reading the balance it sends back"
);
ok(S.includes('if (charged.paidWith !== "holder")'), "a free run is not partially refunded (no fraction of a run exists)");
ok(S.includes("PARTIAL REFUND FAILED"), "a failed refund is loud, not swallowed");
ok(S.includes("refunded = 0;"), "and the client is never told money came back when it did not");
ok(S.includes("shortfall: missing > 0 ?"), "shortfall absent on a clean run");
ok(!S.includes("Partial success still costs a full run"), "the old full-price rule is gone");

console.log("\n3. THE CLIENT");
ok(C.includes("setShortfall(data.shortfall || null)"), "captured");
ok(C.includes("setShortfall(null)"), "cleared on a new run");
ok(C.includes("of {shortfall.asked} options came back"), "stated on screen");

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
