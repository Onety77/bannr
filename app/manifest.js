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
    // ══ BIGGEST FIRST, AND ONE OF THEM MASKABLE ══
    //
    // Two things were wrong with the old order. A 64px .ico was listed
    // first, and plenty of fetchers take the first entry rather than
    // the best one — so the sheet got a 64px icon while a 400px one sat
    // underneath it. And every icon here was the bare mark on
    // transparency, running edge to edge, with nothing declared
    // maskable. Anything that masks to a circle or a squircle — the
    // wallet sheet, an iOS home screen, an Android launcher — was
    // therefore clipping the corners off the mark.
    //
    // icon-512 is the same mark with an opaque background and the mark
    // at 60% of the width, which is inside the safe zone any mask can
    // crop to. It is listed twice deliberately: `maskable` alone is
    // ignored by anything wanting a plain icon, and `any` alone gets no
    // safe-zone treatment, so both purposes name the same file.
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/logo-mark.png", sizes: "96x96", type: "image/png" },
      { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
    ],
  };
}
