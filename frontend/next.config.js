const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const basePath = rawBasePath ? trimTrailingSlash(rawBasePath) : undefined;
const distDir = process.env.NEXT_DIST_DIR || '.next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  distDir,
  ...(basePath ? { basePath } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  // Next 15 replaced the per-flag object with a bare boolean, and 16 rejects
  // the old `{ buildActivity: false }` shape outright.
  devIndicators: false,
  // Turbopack is the default bundler for both `next dev` and `next build` as
  // of Next 16. Pin the project root: Turbopack otherwise picks one by walking
  // up for the nearest lockfile, and this machine has a stray
  // package.json/package-lock.json in the home directory — left to infer, it
  // would trace a tree from outside the repo into the standalone output.
  turbopack: { root: __dirname },
  // The SSO->GMS token bridge serves this app through the SSO backend's
  // same-origin gateway at http://gms.localtest.me:4200 (it proxies to this
  // dev server on 7201) so SameSite cookies survive the handoff. Next 16
  // refuses to serve /_next/* dev resources to an origin other than the one
  // the dev server binds, so without this the browser gets the HTML but every
  // chunk and the HMR client are blocked — which renders as a blank page, not
  // an error. Dev-only; `next build`/`next start` ignore it.
  allowedDevOrigins: ["gms.localtest.me"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
    unoptimized: true,
  },
  experimental: {
    scrollRestoration: true,
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
