import type { MetadataRoute } from 'next'
import { getConfiguredSiteUrl } from '@/lib/site-config'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getConfiguredSiteUrl()
  if (!base) return []
  return ['', '/about', '/projects', '/enquiry', '/privacy'].map((p) => ({ url: `${base}${p}`, lastModified: new Date(),
    changeFrequency: 'monthly', priority: p === '' ? 1 : 0.7 }))
}
