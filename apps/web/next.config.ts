import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@anime-platform/types"],
  turbopack: {
    // Navigate up two directories from apps/web to reach the anime-platform root
    root: path.join(__dirname, "../../"),
  },
};

export default nextConfig;