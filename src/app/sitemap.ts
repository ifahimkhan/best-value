import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

const PATHS = ["/", "/sell", "/shop", "/about", "/contact", "/faq", "/privacy-policy", "/terms", "/refund-policy"] as const;

/** Static pages only; catalog and product pages are found through internal links. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return PATHS.map((path) => ({ url: `${base}${path}` }));
}
