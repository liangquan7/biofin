import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      timeoutSeconds: 120,
    },
  },
};

export default nextConfig;
