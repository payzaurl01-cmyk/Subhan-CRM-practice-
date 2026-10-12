import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
