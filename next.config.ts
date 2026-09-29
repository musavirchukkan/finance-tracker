import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone / LAN testing — hostname only (no scheme/port)
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.3"],
};

export default nextConfig;
