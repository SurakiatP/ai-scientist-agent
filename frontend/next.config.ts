import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  output: "standalone", // the production image runs .next/standalone/server.js
};

export default nextConfig;
