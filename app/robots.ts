import type { MetadataRoute } from 'next'

// Keep the CRM and internal endpoints out of search engines.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/crm', '/connect', '/api', '/auth'] },
    sitemap: process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/sitemap.xml` : undefined,
  }
}
