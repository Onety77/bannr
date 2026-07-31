"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import ConnectButton from "@/components/ConnectButton";
import { short } from "@/lib/wallet";

const LINKS = [
  ["/create", "Create"],
  ["/history", "My banners"],
  ["/credits", "Credits"],
];

const SunIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="3.2" />
    <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.05 3.05l1.13 1.13M11.82 11.82l1.13 1.13M3.05 12.95l1.13-1.13M11.82 4.18l1.13-1.13" />
  </svg>
);

const MoonIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.5 9.8A6 6 0 0 1 6.2 2.5a6 6 0 1 0 7.3 7.3z" />
  </svg>
);

export default function Nav() {
  const path = usePathname();
  const auth = useAuth();
  const { user, loading, error, signOut } = auth;
  const [theme, setTheme] = useState(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  // Close the account menu on any outside click, so it can't be left
  // hanging over the page after navigating.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("bannr.theme", next); } catch {}
  }

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand" aria-label="bannr — home">
          {/* 96px source for a 26px mark — sharp on any display, and
              3KB instead of the 90KB full-size original, which would
              otherwise load on every page view. */}
          <img src="/logo-mark.png" alt="" width={26} height={26} />
          <span>bannr</span>
        </Link>
        <div className="nav-links">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          {/* Nothing renders until we know — a "Connect" button that
              flashes for signed-in users on every page load reads as
              being logged out. */}
          {!loading && (user ? (
            <>
              <Link href="/credits" className="credit-pill">{user.credits} credits</Link>
              <div className="acct" onClick={(e) => e.stopPropagation()}>
                <button className="acct-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                  {short(user.wallet)}
                </button>
                {menu && (
                  <div className="acct-menu">
                    <span className="acct-addr">{short(user.wallet)}</span>
                    <Link href="/history" onClick={() => setMenu(false)}>My banners</Link>
                    <Link href="/credits" onClick={() => setMenu(false)}>Buy credits</Link>
                    <button onClick={() => { setMenu(false); signOut(); }}>Sign out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <ConnectButton auth={auth} />
          ))}
          {error && <span className="nav-err" title={error}>{error}</span>}
          {theme !== null && (
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? SunIcon : MoonIcon}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
