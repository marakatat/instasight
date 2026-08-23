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
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { 
            key: "Content-Security-Policy", 
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; media-src 'self' blob: mediastream:; connect-src 'self' https://*.supabase.co wss://*.supabase.co blob: https://cdn.jsdelivr.net; worker-src 'self' blob:;" 
          },
          { 
            key: "Permissions-Policy", 
            value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()" 
          }
        ],
      },
    ];
  },
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};


export default nextConfig;
