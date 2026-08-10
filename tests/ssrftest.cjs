// Fetching a URL we did not choose.
//
// /api/lookup downloads a token's logo, and that logo URL comes out of
// on-chain metadata written by whoever minted the token — anybody. So
// "open this address" is an instruction from a stranger, and a server
// that follows it can be pointed at localhost, at a private address on
// the same network, or at a cloud metadata endpoint.
//
// The address classifier is RUN here rather than read, because it is
// arithmetic on bitmasks and a regex over the source would prove
// nothing about whether 10.0.0.1 actually comes out private.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nOPENING A URL A STRANGER CHOSE\n");

const S = new Function(
  "require",
  read("lib/safeFetch.js")
    .replace(/^import "server-only";$/m, "")
    .replace(/^import dns from "node:dns\/promises";$/m, 'const dns = require("node:dns/promises");')
    .replace(/^export /gm, "") +
    "\nreturn { privateAddress, publicUrl, fetchPublic };"
)(require);

/* ---------------- what counts as private ---------------- */
const PRIVATE = [
  ["127.0.0.1", "loopback"],
  ["127.1.2.3", "the rest of loopback, which is not just .0.1"],
  ["10.0.0.1", "RFC1918 ten"],
  ["10.255.255.255", "the top of it"],
  ["172.16.0.1", "RFC1918 172.16"],
  ["172.31.255.254", "the top of that range"],
  ["192.168.1.1", "RFC1918 192.168"],
  ["169.254.169.254", "the cloud metadata address"],
  ["0.0.0.0", "this network"],
  ["100.64.0.1", "carrier NAT"],
  ["224.0.0.1", "multicast"],
  ["255.255.255.255", "broadcast"],
  ["::1", "IPv6 loopback"],
  ["fe80::1", "IPv6 link-local"],
  ["fd00::1", "IPv6 unique local"],
  ["::ffff:127.0.0.1", "a v4 loopback wearing a v6 coat"],
];
for (const [ip, why] of PRIVATE) ok(S.privateAddress(ip), `${ip} is private — ${why}`);

// 172.32 is deliberately just OUTSIDE RFC1918. A mask written one bit
// wrong blocks it, and blocking real addresses is its own failure.
const PUBLIC = [
  ["8.8.8.8", "a public resolver"],
  ["1.1.1.1", "another"],
  ["172.32.0.1", "just above the private 172 block"],
  ["172.15.255.255", "just below it"],
  ["11.0.0.1", "just above ten"],
  ["9.255.255.255", "just below ten"],
  ["192.167.255.255", "just below 192.168"],
  ["2606:4700::1111", "a public v6 address"],
];
for (const [ip, why] of PUBLIC) ok(!S.privateAddress(ip), `${ip} is allowed — ${why}`);

/* ---------------- and what counts as a usable URL ---------------- */
(async () => {
  const REFUSED = [
    ["http://127.0.0.1/logo.png", "loopback by address"],
    ["http://169.254.169.254/latest/meta-data/", "the metadata endpoint"],
    ["http://[::1]/logo.png", "loopback in brackets"],
    ["file:///etc/passwd", "a file URL"],
    ["ftp://example.com/x.png", "a protocol we never want"],
    ["not a url at all", "junk"],
    ["", "nothing"],
  ];
  for (const [u, why] of REFUSED) {
    ok((await S.publicUrl(u)) === false, `refused: ${why}`);
  }

  // localhost has to be resolved to be refused, which is the case a
  // pure string check misses.
  ok((await S.publicUrl("http://localhost/x.png")) === false, "refused: localhost, by resolving it");

  // And a real name must still work, or logos stop loading.
  ok((await S.publicUrl("https://example.com/logo.png")) === true, "allowed: an ordinary https URL");

  /* ---------------- wired in where it matters ---------------- */
  const lookup = bare(read("app/api/lookup/route.js"));
  ok(/fetchPublic\(url, \{ maxBytes/.test(lookup), "the logo download goes through the guarded fetch");
  ok(!/await fetchWithTimeout\(url/.test(lookup), "and not through the unguarded one it used to");
  // A few hundred kilobytes of PNG can decode to gigabytes of bitmap.
  ok(/limitInputPixels: 40_000_000/.test(lookup), "with a ceiling on how far an image may decode");

  const convert = bare(read("app/api/convert/route.js"));
  ok(/bgDataUrl\.length > MAX_BG_B64/.test(convert), "convert refuses an oversized background");
  ok(/logoFile\.size > MAX_LOGO_BYTES/.test(convert), "and an oversized logo");
  ok((convert.match(/limitInputPixels: MAX_PIXELS/g) || []).length === 2,
     "and caps decoded pixels on BOTH images it is handed");
  ok(/status: 413/.test(convert), "answering 413 rather than falling over");

  // The size ceiling has to be enforced while READING. The old code
  // checked after the whole body was already in memory, which is the
  // check happening after the damage.
  const safe = bare(read("lib/safeFetch.js"));
  ok(/for await \(const chunk of res\.body\)/.test(safe), "the body is read in chunks");
  ok(/if \(total > maxBytes\) return null/.test(safe), "and abandoned mid-read once it is too big");
  ok(/redirect: "manual"/.test(safe), "redirects are not followed to an unchecked host");
  ok(/records\.every\(\(r\) => !privateAddress\(r\.address\)\)/.test(safe),
     "every resolved address must be public, not merely the first");

  console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
