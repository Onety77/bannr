"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import ConnectButton from "@/components/ConnectButton";
import { short } from "@/lib/wallet";
import Avatar from "@/components/Avatar";

// THIS IS THE DESKTOP NAV, and it has to be kept level with the
// mobile tab bar in components/TabBar.jsx. It was not: the feed and
// the profile shipped, the tab bar got them, and this did not — so
// on a desktop they existed and were reachable only by typing the
// URL. Two navigations for one app is two places to forget.
//
// Feed leads for the same reason it replaced Home on the tab bar:
// it is the screen with a reason to be reopened.
const LINKS = [
  ["/feed", "Feed"],
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

// An account may now have an email, a wallet, both, or neither
// visible — so the nav shows whichever identity it actually has
// rather than assuming there is an address.
function accountLabel(user) {
  if (user.email) {
    const [name] = user.email.split("@");
    return name.length > 14 ? name.slice(0, 13) + "…" : name;
  }
  if (user.wallet) return short(user.wallet);
  return "Account";
}

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
                  {/* A face rather than a word. Profiles exist now, so
                      the account button should look like one. */}
                  <Avatar handle={user.handle} photo={user.photo} size={22} />
                  {user.handle ? `@${user.handle}` : accountLabel(user)}
                </button>
                {menu && (
                  <div className="acct-menu">
                    <span className="acct-addr">{accountLabel(user)}</span>
                    {/* Your profile first: it is the page that owns
                        everything below it, and it did not exist on
                        desktop at all until now. */}
                    <Link href="/you" onClick={() => setMenu(false)}>Your profile</Link>
                    {user.handle && (
                      <Link href={`/u/${user.handle}`} onClick={() => setMenu(false)}>
                        Public profile
                      </Link>
                    )}
                    <Link href="/history" onClick={() => setMenu(false)}>My banners</Link>
                    <Link href="/credits" onClick={() => setMenu(false)}>Buy credits</Link>
                    <Link href="/settings" onClick={() => setMenu(false)}>Settings</Link>
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
