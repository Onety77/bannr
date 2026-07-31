/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp runs in API routes (server only)
  experimental: { serverComponentsExternalPackages: ["sharp", "firebase-admin"] },
};
export default nextConfig;
