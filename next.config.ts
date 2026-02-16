import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false
  },
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
