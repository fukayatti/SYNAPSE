import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  allowedDevOrigins: ["172.20.10.3", "localhost:3000", "10.250.81.127"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
      {
        source: "/trpc/:path*",
        destination: "http://localhost:3001/trpc/:path*",
      },
    ];
  },
};

export default nextConfig;
