import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

// Only allow images from OUR Supabase project's public storage, not any
// *.supabase.co host, so /_next/image can't be used as a free resizing proxy.
function supabaseImageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const imageHost = supabaseImageHost();

const headers = securityHeaders({
  isDev: process.env.NODE_ENV === "development",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers }];
  },
  partialPrefetching: true,
  experimental: {
    // Supplier feed uploads (4 MB cap in the action) plus multipart overhead; Vercel caps bodies at ~4.5 MB
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  images: {
    remotePatterns: imageHost
      ? [{ protocol: "https", hostname: imageHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
