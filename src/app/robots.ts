import type { MetadataRoute } from "next";
import { SITE_URL_STRING } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/contact", "/help", "/logo/"],
      disallow: [
        "/admin/",
        "/dashboard",
        "/files",
        "/folders",
        "/links",
        "/notifications",
        "/profile",
        "/search",
        "/settings",
        "/shared",
        "/starred",
        "/superadmin/",
        "/transactions",
        "/transfers",
        "/trash",
        "/l/",
        "/share/",
        "/t/",
      ],
    },
    sitemap: `${SITE_URL_STRING}/sitemap.xml`,
    host: SITE_URL_STRING,
  };
}
