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
  {
    href: "/credits", label: "Credits",
    icon: (
      <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="11" cy="11" r="7.5" />
        <path d="M13.6 8.8a3 3 0 1 0 0 4.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""}>
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
