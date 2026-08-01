// Mobile bottom tab bar — native-app navigation on phones.
// Hidden on desktop via CSS (globals.css .tabbar).
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/", label: "Home",
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.5 9.5 11 3l7.5 6.5V18a1.5 1.5 0 0 1-1.5 1.5h-3.5V14h-5v5.5H5A1.5 1.5 0 0 1 3.5 18V9.5z" />
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
  // screen and breaks the bar. Credits used to sit here; it moved
  // inside "You", which already shows the balance and a Buy button —
  // and the credits pill in the top bar still links straight to it,
  // so buying is never more than one tap away.
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

export default function TabBar() {
  const path = usePathname();
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
