// ============================================================
// REGISTERS public/sw.js, and nothing else.
//
// Renders no markup. It exists because a service worker has to be
// registered from a page, and putting three lines of navigator API
// into the root layout would make that layout a client component —
// which would opt the entire app out of server rendering to buy an
// install prompt.
//
// See public/sw.js for why that worker caches nothing.
// ============================================================
"use client";
import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // After load, not during it. Registration competes for the network
    // with the page's own JavaScript, and the install prompt is worth
    // exactly nothing to somebody still waiting for the first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration costs the install prompt and nothing
        // else — every page still works. Silent on purpose: there is
        // nothing the person reading a console can do about it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
