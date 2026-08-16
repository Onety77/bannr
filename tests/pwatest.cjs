// Installable as an app, and still the same website.
//
// A progressive web app is the existing site plus two small files. The
// risk is entirely in one of them: a service worker that caches HTML
// or JavaScript means somebody who installed the app keeps running an
// old build after every deploy, with no obvious way to get the new
// one. This project ships several times an hour and rebuilt its
// payment path four times in one of them — serving a stale copy of
// that to someone spending money is worse than anything caching could
// prevent.
//
// So these assertions are mostly about what the worker must NOT do.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nINSTALLABLE, AND STILL THE SAME SITE\n");

const SW = bare(read("public/sw.js"));

/* ---------------- it must not serve stale code ---------------- */
// respondWith is the call that replaces a real network response with
// something the worker chose. Its absence is the whole design.
ok(!/respondWith/.test(SW), "the fetch handler never answers a request itself");
ok(!/caches\.open|cache\.put|cache\.addAll/.test(SW), "nothing is ever written to a cache");
ok(/caches\.delete/.test(SW), "and anything a previous version cached is cleared on upgrade");
// Without these a new worker waits for every tab to close, so the file
// standing between users and a deploy would be this one.
ok(/skipWaiting\(\)/.test(SW), "a new worker takes over immediately");
ok(/clients\.claim\(\)/.test(SW), "and claims open pages rather than waiting for them to close");

/* ---------------- but it must still exist ---------------- */
// Chrome will not offer to install a site without a fetch handler
// registered, which is the only reason this file is here.
ok(/addEventListener\("fetch"/.test(SW), "a fetch handler is registered, which is what Chrome requires");
ok(/addEventListener\("install"/.test(SW) && /addEventListener\("activate"/.test(SW),
   "with a full lifecycle, so upgrades are clean");

/* ---------------- registered without costing the app ---------------- */
const REG = bare(read("components/ServiceWorker.jsx"));
ok(/"use client"/.test(read("components/ServiceWorker.jsx")), "the registrar is a client component");
ok(/return null/.test(REG), "that renders nothing");
// Three lines of navigator API in the root layout would make the
// LAYOUT a client component, opting the whole app out of server
// rendering to buy an install prompt.
const LAYOUT = read("app/layout.jsx");
ok(!/"use client"/.test(LAYOUT), "so the root layout stays a server component");
ok(/<ServiceWorker \/>/.test(LAYOUT), "and mounts it");
// Registration competes for the network with the page's own
// JavaScript, and an install prompt is worth nothing to somebody still
// waiting for the first paint.
ok(/readyState === "complete"/.test(REG) && /addEventListener\("load"/.test(REG),
   "registered after load, never during it");
ok(/\.catch\(/.test(REG), "and a failure costs the prompt, not the page");

/* ---------------- the two platforms read different files ---------------- */
const MANIFEST = bare(read("app/manifest.js"));
ok(/display: "standalone"/.test(MANIFEST), "Android gets a manifest that says standalone");
ok(/icon-512\.png/.test(MANIFEST), "with an icon big enough to install with");

// iOS ignores most of the manifest. Without these, Add to Home Screen
// makes a bookmark that opens in Safari with the address bar showing —
// a shortcut, not an app.
ok(/appleWebApp:/.test(LAYOUT), "and iOS gets the meta it actually reads");
ok(/capable: true/.test(LAYOUT), "declaring it can run standalone");
// black-translucent pulls the page under the clock and the notch, and
// only the BOTTOM safe-area inset is handled in globals.css.
ok(/statusBarStyle: "default"/.test(LAYOUT), "with a status bar that does not overlap the nav");
{
  const css = read("app/globals.css");
  const top = /safe-area-inset-top/.test(css);
  ok(!top, "confirmed: nothing pads the top inset yet, which is why translucent is refused");
}

console.log(bad ? `\n${bad} FAILED\n` : "\nall green\n");
process.exit(bad ? 1 : 0);
