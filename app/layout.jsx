import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import Socials from "@/components/Socials";
import TabBar from "@/components/TabBar";
import Fx from "@/components/Fx";

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
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://bannr.vercel.app");

export const metadata = {
  metadataBase: new URL(SITE),
  title: "bannr — professional token banners in seconds",
  description:
    "Professional DEX Screener banners in seconds. Drop a logo, pick a style, get 2–4 options at exact dimensions. Pay in SOL.",
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
      </body>
    </html>
  );
}
