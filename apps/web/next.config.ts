import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source.
  transpilePackages: ["@ai-tutor/shared"],
  // Dev mode only: let a phone reach `next dev` through a free Cloudflare quick tunnel
  // (https://<random>.trycloudflare.com). Has no effect on production builds.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
