import type { NextConfig } from "next";

// Admin pages and API routes (Compute / Migrate dashboards) live in *.dev.tsx /
// *.dev.ts files. They are only registered when NEXT_PUBLIC_DEV_MODE=true at
// build time, so they don't even compile into the production bundle.
const includeDevPages = process.env.NEXT_PUBLIC_DEV_MODE === "true";

const nextConfig: NextConfig = {
  pageExtensions: includeDevPages
    ? ["dev.tsx", "dev.ts", "tsx", "ts"]
    : ["tsx", "ts"],
  serverExternalPackages: ["geotiff", "traveltime-api", "h3-js"],
};

export default nextConfig;
