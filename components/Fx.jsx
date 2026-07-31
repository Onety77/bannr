// Page-wide motion effects, mounted once in the root layout.
// 1. Scroll reveals: any element with [data-sr] rises in when it
//    enters the viewport (re-scans on every route change).
// 2. Cursor glow: feeds --mx/--my to cards so their radial glow
//    follows the pointer.
// Renders nothing; respects prefers-reduced-motion via CSS.
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function Fx() {
  const path = usePathname();

  useEffect(() => {
    const els = document.querySelectorAll("[data-sr]:not(.sr-in)");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("sr-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("sr-in");
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [path]);

  useEffect(() => {
    const move = (e) => {
      const card = e.target.closest?.(".feature-hero, .g-card, .pack");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);

  return null;
}
