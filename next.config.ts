import type { NextConfig } from "next";

const appRoot = process.cwd();

/** Long Snap. The made-up demo leagues' files (data/demo) are read at run time, so they ship with the server. */
const nextConfig: NextConfig = {
  turbopack: { root: appRoot },
  outputFileTracingRoot: appRoot,
  outputFileTracingIncludes: { "/**": ["./data/demo/**/*", "./lib/generated/*.json"] },
  images: { unoptimized: true },
  env: { HQ_FIREBASE_WEBAPP_CONFIG: process.env.FIREBASE_WEBAPP_CONFIG ?? "" },
};

export default nextConfig;
