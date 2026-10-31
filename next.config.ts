import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  compress: true,
  poweredByHeader: false,
};
export default nextConfig;
