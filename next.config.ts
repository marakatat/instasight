import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Content Security Policy is best implemented in middleware, but basic headers can go here
        ],
      },
    ];
  },
  serverExternalPackages: [],
  serverActions: {
    bodySizeLimit: '100mb',
  },
};

export default nextConfig;
