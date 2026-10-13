import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for container deployment (ECR/App Runner).
  output: "standalone",
};

export default nextConfig;
