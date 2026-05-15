import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma client + engine: avoid bundling into Route Handlers (fewer NFT / trace issues on Vercel).
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
