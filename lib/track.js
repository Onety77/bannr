// The client half of the funnel. See lib/stats.js.
//
// ONCE PER TAB, NOT ONCE PER MOUNT. Next keeps the JS context alive
// across client navigation, so a component in the layout mounts once —
// but a hard reload, a shared link opened cold, and a back-forward
// restore all mount it again. sessionStorage is the right scope: it
// survives reloads within the tab and dies when the tab does, which
// is as close to "a visit" as a browser will tell you without an
// identifier.
"use client";

const KEY = (event) => `t:${event}`;

export function track(event) {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(KEY(event))) return;
    // Written BEFORE the request, not after. A double render or a
    // fast second call would otherwise both pass the check while the
    // first was still in flight.
    sessionStorage.setItem(KEY(event), "1");
  } catch {
    // Private mode, or storage disabled. Counting twice is better
    // than not counting, so fall through rather than return.
  }
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      // Survives the navigation that often follows immediately —
      // "started" in particular fires moments before someone leaves
      // for the sign-in page.
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
