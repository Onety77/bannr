/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp runs in API routes (server only)
  experimental: { serverComponentsExternalPackages: ["sharp", "firebase-admin"] },

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
