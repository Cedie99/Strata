import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Attachments and spreadsheet imports go through Server Actions; files are capped at 10 MB in code.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
