import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for container deployment.
  output: "standalone",
  // Keep the studio view clean; the dev bubble is not part of the design.
  devIndicators: false,
};

export default nextConfig;
