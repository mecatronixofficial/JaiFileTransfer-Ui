import type { NextConfig } from "next";

const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "https://jai-file-transfer-server.vercel.app");

const backendUrl = configuredBackendUrl
  ? `${/^https?:\/\//i.test(configuredBackendUrl) ? "" : "https://"}${configuredBackendUrl}`.replace(
      /\/(?:api\/v1)?\/?$/i,
      "",
    )
  : undefined;

const proxyClientMaxBodySize = (
  process.env.NEXT_PROXY_CLIENT_MAX_BODY_SIZE || "512mb"
) as NonNullable<NextConfig["experimental"]>["proxyClientMaxBodySize"];

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize,
  },
  async rewrites() {
    if (!backendUrl) return [];

    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
