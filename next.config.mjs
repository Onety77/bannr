/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp runs in API routes (server only)
  experimental: {
    serverComponentsExternalPackages: ["sharp", "firebase-admin"],
    // Style references live outside public/ so they are never served,
    // which also means Next has no reason to guess they are needed.
    // Without this they are simply absent in production and the styles
    // that use them quietly lose them — the worst kind of bug, because
    // it works perfectly on a laptop.
    outputFileTracingIncludes: {
      "/api/generate": ["./references/**/*"],
    },
  },

  // ------------------------------------------------------------
  // Serve Firebase's sign-in helper from OUR origin.
  //
  // By default the auth handler lives at
  // <project>.firebaseapp.com/__/auth/handler, so finishing a sign-in
  // means the credential has to cross from that origin back to ours.
  // Safari's tracking prevention treats that as third-party storage and
  // blocks it — the standard reason a mobile redirect sign-in ends on a
  // blank page and comes back still signed out.
  //
  // Proxying the path makes the whole exchange same-origin, which is
  // Firebase's own documented fix for this.
  //
  // ACTIVE. lib/firebaseClient.js sets authDomain to our own host, so
  // every sign-in now comes through this proxy. If it is removed,
  // sign-in breaks everywhere — the two belong together.
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // ONE HOME, SO THE WALLET SHOWS ONE NAME.
  //
  // bannr.vercel.app kept serving the whole site alongside the custom
  // domain. That is not just untidy: Phantom's connect sheet shows
  // `app_url`, and app_url is window.location.origin — so anyone who
  // arrived on the vercel host was asked to approve a site calling
  // itself bannr.vercel.app. Same for the icon and the manifest, which
  // wallets fetch from whatever origin asked.
  //
  // ══ WHY THIS IS NARROW ON PURPOSE ══
  //
  // Matching *.vercel.app would swallow every PREVIEW deployment and
  // bounce it to production, which would make previews untestable —
  // the branch you wanted to check would redirect to main. So it
  // matches the ONE stable production alias and nothing else.
  //
  // ══ AND WHY IT CANNOT LOOP ══
  //
  // VERCEL_PROJECT_PRODUCTION_URL sometimes becomes the CUSTOM domain
  // once one is attached — see app/layout.jsx, which is bitten by the
  // same thing. If that happened here we would redirect getbannr.com
  // to getbannr.com forever. Hence both guards: the source must be a
  // real vercel.app host, and it must differ from the destination.
  // If either fails, no redirect is emitted at all.
  //
  // Temporary (307), not permanent: a 308 is cached by the browser
  // essentially forever, and that is not something to hand out while
  // the canonical host is still settling.
  // ------------------------------------------------------------
  async redirects() {
    const from = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
    const to = String(process.env.NEXT_PUBLIC_SITE_URL || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    if (!from.endsWith(".vercel.app")) return [];
    if (!to || !to.includes(".") || to === from) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: from }],
        destination: `https://${to}/:path*`,
        permanent: false,
      },
    ];
  },

  async rewrites() {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!project) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${project}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};
export default nextConfig;
