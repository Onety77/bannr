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

export const metadata = {
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
        <Nav />
        {children}
        <footer className="footer wrap">
          <span>bannr © 2026</span>
          <Socials compact />
          <span>1500×500 · 1300×500 · SOL</span>
        </footer>
        <TabBar />
      </body>
    </html>
  );
}
