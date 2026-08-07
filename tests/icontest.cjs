// The icon a wallet shows next to our name on its connect sheet.
//
// Phantom fetches app_url and looks for one by convention: manifest,
// then apple-touch-icon, then /favicon.ico. We served none of those —
// only Next's hashed `/icon.png?31adfb…` — so the sheet showed a
// broken image while every other dapp showed a logo, on the exact
// screen where someone decides whether to trust us with a signature.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

console.log("\n1. THE FILES EXIST, AT PLAIN PATHS");
for (const f of ["public/favicon.ico", "app/apple-icon.png", "public/og.png"]) {
  ok(fs.existsSync(R + f), f + " exists");
}
ok(fs.existsSync(R + "app/manifest.js"), "and a manifest route generates the third");

console.log("\n2. IT IS A REAL .ICO, NOT A PNG WEARING THE NAME");
{
  const b = fs.readFileSync(R + "public/favicon.ico");
  ok(b.readUInt16LE(0) === 0, "ICONDIR reserved field is zero");
  ok(b.readUInt16LE(2) === 1, "type is 1 (icon, not cursor)");
  const count = b.readUInt16LE(4);
  ok(count >= 1, "declares " + count + " image");
  const size = b.readUInt32LE(14);
  const off = b.readUInt32LE(18);
  ok(off === 22, "payload starts right after the single directory entry");
  ok(off + size === b.length, "and the declared length matches the file exactly");
  const png = b.subarray(off, off + size);
  ok(png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "the payload is a PNG, which every modern consumer reads");
  const w = b.readUInt8(6) || 256;
  ok(w >= 32, "at " + w + "px, big enough not to look scaled on a phone sheet");
}

console.log("\n3. THE HEAD DECLARES THEM");
{
  const L = read("app/layout.jsx");
  ok(L.includes('icon: "/favicon.ico"'), "icon");
  ok(L.includes('shortcut: "/favicon.ico"'), "shortcut icon");
  ok(L.includes('apple: "/apple-icon.png"'), "apple-touch-icon");
  ok(/openGraph:[\s\S]{0,400}images: \[\{ url: "\/og\.png"/.test(L), "and an og:image, which scrapers reach for too");
  ok(L.includes("metadataBase"), "with metadataBase, or the paths resolve to nothing");

  // The built output is the only authority on what actually ships.
  const built = R + ".next/server/app/index.html";
  if (fs.existsSync(built)) {
    const h = fs.readFileSync(built, "utf8");
    ok(/<link rel="icon" href="\/favicon\.ico"/.test(h), "BUILT: the icon link is a plain path");
    ok(/<link rel="apple-touch-icon" href="\/apple-icon\.png"/.test(h), "BUILT: apple-touch-icon is emitted");
    ok(/<link rel="manifest"/.test(h), "BUILT: the manifest is linked");
    ok(/og:image" content="https?:\/\/[^"]+\/og\.png"/.test(h), "BUILT: og:image is absolute");
    // The bug: a hashed URL that conventional fetchers do not parse.
    ok(!/rel="icon" href="\/icon\.png\?/.test(h), "BUILT: NO hashed icon URL, which is what wallets could not follow");
  } else {
    console.log("  SKIP  (no build output — run npm run build to check the emitted head)");
  }
}

console.log("\n4. THE MANIFEST NAMES ICONS A FETCHER CAN RESOLVE");
{
  const M = read("app/manifest.js");
  const srcs = [...M.matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
  ok(srcs.length >= 2, "lists " + srcs.length + " icons");
  for (const s of srcs) {
    ok(s.startsWith("/"), s + " is an absolute path");
    ok(!s.includes("?"), "  …with no build hash on it");
    const onDisk = s === "/favicon.ico" || s === "/og.png" ? "public" + s : "public" + s;
    ok(fs.existsSync(R + onDisk), "  …and the file is really there");
  }
  ok(M.includes('start_url: "/"'), "and a start_url, so it is a valid manifest");
}

console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
process.exit(bad ? 1 : 0);
