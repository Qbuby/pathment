import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * The two files a phone reads before it will open a link in the app.
   *
   * They have to be served from `/.well-known/`, and the app router skips a
   * directory whose name starts with a dot, so the handlers live at a normal
   * path and the well known URLs point at them. Both are generated from the
   * environment rather than checked in, because a signing fingerprint changes
   * with the signing key and a stale one silently stops verifying.
   */
  async rewrites() {
    return [
      { source: '/.well-known/assetlinks.json', destination: '/app-links/assetlinks.json' },
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/app-links/apple-app-site-association',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
