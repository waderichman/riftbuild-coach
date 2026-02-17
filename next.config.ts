import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
