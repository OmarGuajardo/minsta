import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets the Next.js dev client (HMR/hydration bootstrap) work when the app
  // is loaded through an ngrok tunnel instead of localhost.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app"],
};

export default nextConfig;
