import type { MetadataRoute } from "next";

/** Private finance app — block all crawlers until a public landing exists. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
