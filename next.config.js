const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output bundles a minimal node_modules into .next/standalone
  // so the production Docker image stays small.
  output: "standalone",
  // Pin the workspace root so Next doesn't pick up an unrelated parent lockfile.
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};
module.exports = nextConfig;
