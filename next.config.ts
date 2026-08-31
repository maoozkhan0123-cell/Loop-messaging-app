import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Supabase API + Realtime
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co`,
      // Images from Supabase storage + data URIs for avatars
      `img-src 'self' data: blob: https://*.supabase.co`,
      // Inline styles needed by Tailwind + framer-motion
      "style-src 'self' 'unsafe-inline'",
      // Scripts — Next.js needs unsafe-eval in dev; in prod only 'self'
      `script-src 'self' ${process.env.NODE_ENV === "development" ? "'unsafe-eval' 'unsafe-inline'" : "'unsafe-inline'"}`,
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'date-fns',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oelgyzuacdqntwgkhsko.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
