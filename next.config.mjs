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
  // ══ KEYED ON THE BUILD, NOT ON A HOSTNAME ══
  //
  // The obvious version of this reads VERCEL_PROJECT_PRODUCTION_URL and
  // redirects that one host. It does not work, and the site proved it:
  // once a custom domain is attached that variable becomes the CUSTOM
  // domain, so the rule either never matches or, without a guard,
  // redirects getbannr.com to itself forever. app/layout.jsx documents
  // the same trap for metadataBase.
  //
  // So the source is any *.vercel.app host, and previews are protected
  // by VERCEL_ENV instead. A preview build is `preview` and emits no
  // rule at all, so preview URLs keep working and stay testable. Only
  // the production build emits one, which is the build that answers on
  // bannr.vercel.app — and on the per-deployment URL too, which should
  // also point home.
  //
  // The destination still cannot be a vercel.app host, or a production
  // build with no custom domain configured would redirect to itself.
  //
  // Temporary (307), not permanent: a 308 is cached by the browser
  // essentially forever, and that is not something to hand out while
  // the canonical host is still settling.
  // ------------------------------------------------------------
  async redirects() {
    if (process.env.VERCEL_ENV !== "production") return [];
    const to = String(process.env.NEXT_PUBLIC_SITE_URL || "https://getbannr.com")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    if (!to.includes(".") || to.endsWith(".vercel.app")) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<vhost>.*\\.vercel\\.app)" }],
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
