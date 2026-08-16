import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import Socials from "@/components/Socials";
import TabBar from "@/components/TabBar";
import Fx from "@/components/Fx";
import Track from "@/components/Track";
import ServiceWorker from "@/components/ServiceWorker";
import Modals from "@/components/Modals";

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

// metadataBase is what lets a page declare an Open Graph image as a
// plain path. Without it Next emits the path unresolved and every
// unfurl — Telegram, X, Discord — shows a link with no picture, which
// is most of the reason to have shareable posts at all.
//
// VERCEL_PROJECT_PRODUCTION_URL is the stable production host rather
// than the per-deployment one, so a preview build does not mint links
// pointing at a URL that stops existing.
// SET NEXT_PUBLIC_SITE_URL IN VERCEL. It is first for a reason:
// VERCEL_PROJECT_PRODUCTION_URL does not reliably become the custom
// domain when one is attached, so leaving it to that would mint every
// unfurl — Telegram, X, Discord — against the old vercel.app host
// while the site itself lives somewhere else. Nothing would look
// broken; the links would just point at the wrong home.
const FALLBACK = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://getbannr.com";

// ══ A TYPED ENV VAR MUST NOT BE ABLE TO FAIL THE BUILD ══
//
// metadataBase is `new URL(SITE)`, and new URL("getbannr.com") throws
// — no scheme, not a URL. This value is entered by hand in a dashboard
// at the exact moment a domain goes live, which is the worst possible
// moment for a missing "https://" to take the whole site down rather
// than produce a slightly wrong link. The scheme is added if it is
// missing, a trailing slash is dropped, and anything still unparseable
// falls back rather than throwing.
function siteUrl() {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return FALLBACK;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    // A half-typed "https://" survives parsing as the hostname
    // "https", which is a valid URL and a useless one. A real host has
    // a dot in it, or is localhost.
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return FALLBACK;
    return u.origin;
  } catch {
    return FALLBACK;
  }
}

const SITE = siteUrl();

const DESCRIPTION =
  "Professional DEX Screener banners in seconds. Drop a logo, pick a style, get 2–4 options at exact dimensions. Pay in SOL.";

export const metadata = {
  metadataBase: new URL(SITE),
  title: "bannr — professional token banners in seconds",
  description: DESCRIPTION,
  // Declared at plain paths, without Next's build hash on them.
  // Wallets fetch app_url and look for an icon by convention — see
  // app/manifest.js for what that costs us when they find nothing.
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  // ══ ADD TO HOME SCREEN, ON IOS ══
  //
  // Android reads app/manifest.js and offers to install. iOS ignores
  // most of that file and reads these instead — without them, Add to
  // Home Screen produces a bookmark that opens in Safari with the
  // address bar still there, which is not an app, it is a shortcut.
  //
  // statusBarStyle is "default" rather than "black-translucent" on
  // purpose. Translucent pulls the page up UNDER the clock and the
  // notch, and only the bottom safe-area inset is handled in
  // globals.css — the top is not. It would put the nav under the
  // status bar on every phone with one. Worth revisiting, but it needs
  // top padding first, and that is a layout change rather than a
  // metadata one.
  appleWebApp: {
    capable: true,
    title: "bannr",
    statusBarStyle: "default",
  },
  // Also how a scraper decides what our link looks like, which until
  // now was a title and no picture anywhere it was pasted.
  openGraph: {
    type: "website",
    siteName: "bannr",
    title: "bannr — professional token banners in seconds",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "bannr — professional token banners in seconds",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Applies the saved theme (or the system preference) before first
// paint so there is no flash of the wrong theme.
const themeScript = `(function(){try{var s=localStorage.getItem('bannr.theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Fx />
        <Track />
        {/* Renders nothing. Registers public/sw.js, which is what
            lets a phone install this as an app. */}
        <ServiceWorker />
        {/* One scroll container, and on a phone it is the ONLY thing
            that scrolls. The document staying still is what stops iOS
            rubber-banding — and the bounce is what was dragging the
            fixed tab bar up off the bottom of the screen.

            The tab bar sits OUTSIDE it, so it is fixed to the viewport
            rather than to a scrolling box. On desktop the container is
            not a scroller at all and nothing here changes. */}
        <div id="app-scroll" className="app-scroll">
          <Nav />
          {children}
          <footer className="footer wrap">
            <span>bannr © 2026</span>
            <Socials compact />
          </footer>
        </div>
        <TabBar />
        <Modals />
      </body>
    </html>
  );
}
