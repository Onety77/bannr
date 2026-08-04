// Mobile bottom tab bar — native-app navigation on phones.
// Hidden on desktop via CSS (globals.css .tabbar).
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const TABS = [
  // FEED SITS WHERE HOME USED TO.
  //
  // Home is a sales page. Once someone is signed in they have no
  // reason to return to it, and the feed is the thing worth coming
  // back for — putting it behind a fifth tab, or behind a swipe,
  // would be hiding the only screen with a reason to be reopened.
  //
  // Home is NOT unreachable: the wordmark in the top bar links to it
  // from every page, which is where people look for it anyway.
  {
    href: "/feed", label: "Feed",
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="16" height="7" rx="2" />
        <path d="M3 14.5h11M3 18h7" />
      </svg>
    ),
  },
  {
    href: "/create", label: "Create",
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <rect x="3.5" y="3.5" width="15" height="15" rx="4" />
        <path d="M11 7.5v7M7.5 11h7" />
      </svg>
    ),
  },
  {
    href: "/history", label: "Banners",
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="16" height="6" rx="2" />
        <rect x="3" y="14" width="16" height="6" rx="2" opacity="0.5" />
      </svg>
    ),
  },
  // FOUR TABS, MAXIMUM. A fifth wraps to a second line on a 375px
  // screen and breaks the bar.
  //
  // Not made scrollable, which was considered: a tab bar works on
  // fixed spatial memory — your thumb learns that Create is second
  // from the left and stops reading. Scrolling destroys that, hides
  // whichever tab most needs discovering, and fights the OS gestures
  // that live along the bottom edge of a phone.
  //
  // Credits used to sit here; it moved inside "You", which already
  // shows the balance and a Buy button — and the credits pill in the
  // top bar still links straight to it, so buying is never more than
  // one tap away.
  {
    href: "/settings", label: "You",
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="8" r="3.4" />
        <path d="M4.5 18.5a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
];

// THE BAR GETS OUT OF THE WAY WHILE THE KEYBOARD IS UP.
//
// A `position: fixed` element is pinned to the LAYOUT viewport, and
// iOS does not shrink that when the software keyboard opens — it
// shrinks the VISUAL viewport instead. So the bar ends up floating in
// the middle of the screen, and scrolling drags it along before the
// page moves at all. Together with the 64px this bar reserves at the
// foot of the body, that is most of a phone screen spent on furniture
// at the exact moment someone is trying to read the field they are
// typing into.
//
// Nothing here needs to be reachable mid-sentence, so it leaves.
//
// visualViewport is the accurate signal and is on every modern mobile
// browser: it reports the height the keyboard actually left behind.
// The 0.75 threshold clears the browser's own chrome collapsing on
// scroll, which is a ~6% change, while a keyboard is nearer 40%.
// focusin/focusout is the fallback where the API is missing — cruder,
// because it fires for a hardware keyboard too, but harmless.
// It also publishes --kb: how tall the keyboard is, in the coordinate
// space a bottom-anchored element actually lives in.
//
// That number is what lets the Generate bar sit ON the keyboard rather
// than floating somewhere above it. It was pinned 74px up to clear the
// tab bar, and once the tab bar started hiding itself that gap became
// a hole — the button hanging in the middle of the page over the form
// it belongs under.
//
//   --kb = innerHeight - visualViewport.height - visualViewport.offsetTop
//
// innerHeight is the LAYOUT viewport, which iOS leaves alone; the
// visual viewport is what the keyboard shrinks. The difference is the
// keyboard, and offsetTop subtracts however far the page has been
// scrolled inside it — without that the bar drifts as you scroll to
// the next field, which is the exact complaint.
//
// Recomputed on visualViewport SCROLL as well as resize, because that
// offset changes continuously while you move around a focused form.
function useKeyboardOpen() {
  useEffect(() => {
    const root = document.documentElement;
    const set = (on) => root.classList.toggle("kb-open", on);
    const inset = (px) => root.style.setProperty("--kb", `${Math.round(px)}px`);

    const vv = window.visualViewport;
    if (vv) {
      root.classList.add("kb-measured");
      const sync = () => {
        const gap = window.innerHeight - vv.height - vv.offsetTop;
        // Clamped. A mid-transition frame can report nonsense, and a
        // wild value here throws the button off the screen entirely.
        inset(Math.min(Math.max(gap, 0), window.innerHeight * 0.7));
        set(vv.height < window.innerHeight * 0.75);
      };
      vv.addEventListener("resize", sync);
      vv.addEventListener("scroll", sync);
      sync();
      return () => {
        vv.removeEventListener("resize", sync);
        vv.removeEventListener("scroll", sync);
        root.classList.remove("kb-measured");
        set(false);
        inset(0);
      };
    }

    // No visualViewport means no way to know where the keyboard ends,
    // and a bar pinned to a guess is worse than no bar. kb-measured
    // stays off, and the CSS hides it instead — see globals.css.
    const isField = (el) => el && /^(INPUT|TEXTAREA)$/.test(el.tagName);
    const on = (e) => { if (isField(e.target)) set(true); };
    const off = (e) => { if (isField(e.target)) set(false); };
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
      set(false);
    };
  }, []);
}

export default function TabBar() {
  const path = usePathname();
  useKeyboardOpen();
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => {
        // /credits has no tab of its own now, so "You" owns it —
        // otherwise the bar shows nothing selected on that page and
        // you appear to have navigated outside the app.
        const active = path === t.href || (t.href === "/settings" && path === "/credits");
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""}>
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
