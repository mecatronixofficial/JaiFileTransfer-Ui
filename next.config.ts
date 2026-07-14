import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL must be set to the deployed backend URL for production builds.");
}

const proxyClientMaxBodySize = (
  process.env.NEXT_PROXY_CLIENT_MAX_BODY_SIZE || "512mb"
) as NonNullable<NextConfig["experimental"]>["proxyClientMaxBodySize"];

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
