// ============================================================
// SERVICE WORKER — AND IT CACHES NOTHING, DELIBERATELY.
//
// Its entire job is to exist. Chrome will not offer to install a site
// as an app unless a service worker with a fetch handler is
// registered, so this is the price of the install prompt and nothing
// more.
//
// ══ WHY NOT CACHE ══
//
// The classic failure of a progressive web app is a service worker
// that caches HTML and JavaScript: you ship a fix, and everyone who
// installed the app keeps running last week's code with no obvious way
// to get the new one. This project deploys several times an hour on a
// busy day, and the payment path has been rebuilt four times in one of
// them. Serving a stale copy of that to somebody spending money is a
// worse bug than any this could prevent.
//
// So every request goes straight to the network, exactly as it does
// without a service worker installed. An installed app is always as
// current as the website, because it IS the website.
//
// Offline support is a real feature and a separate decision. If it is
// ever wanted, it belongs here as a deliberate choice about which
// routes are safe to serve stale — not as a side effect of wanting an
// icon on a home screen.
// ============================================================

// skipWaiting + claim: a new worker takes over immediately rather than
// waiting for every tab to close. Without it, the thing standing
// between users and a deploy would be this file itself.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Anything a previous version of this file may have cached is
      // removed on upgrade. Nothing writes caches today, and this is
      // what makes that reversible if something ever does by mistake.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// Present, and intentionally passive. Not calling respondWith hands
// the request back to the browser untouched, which is the whole point:
// the handler satisfies the install requirement without changing how a
// single request behaves.
self.addEventListener("fetch", () => {});
