import type { MetadataRoute } from "next";
import { SITE_URL_STRING } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL_STRING}/login`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL_STRING}/contact`,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL_STRING}/help`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
