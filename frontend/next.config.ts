import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  async redirects() {
    return [{ source: "/docs", destination: "/manual/index.html", permanent: false }]; // the built user manual, copied to public/manual by manual/publish-web.sh
  },
  output: "standalone", // the production image runs .next/standalone/server.js
};

export default nextConfig;
