// The web app manifest.
//
// Added for WALLETS, not for installability. Phantom's connect sheet
// shows the requesting site's icon, and it — like most wallets —
// fetches app_url and looks for one in a fixed order: the manifest
// first, then apple-touch-icon, then /favicon.ico.
//
// We served none of those. The only icon tag Next emitted was
// `<link rel="icon" href="/icon.png?31adfb…">`, with a build hash on
// it, and /favicon.ico was a 404 — so the sheet showed a broken
// image next to our name while every other dapp showed a logo. That
// is the worst possible moment to look unfinished: it is the screen
// where someone decides whether to trust us with a signature.
//
// Icons are listed at plain, unhashed paths so anything fetching
// them by convention finds them.
export default function manifest() {
  return {
    name: "bannr — professional token banners",
    short_name: "bannr",
    description: "Professional DEX Screener banners in seconds.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
      { src: "/logo-mark.png", sizes: "96x96", type: "image/png" },
      { src: "/logo.png", sizes: "400x400", type: "image/png", purpose: "any" },
    ],
  };
}
