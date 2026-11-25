import { getConfiguredSiteUrl } from '@/lib/site-config'

/** Renders one JSON-LD block. `<` is escaped so page text can never close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

/** BreadcrumbList for a top-level page (Home > Page). Needs absolute URLs, so renders nothing until NEXT_PUBLIC_SITE_URL is set. */
export function Breadcrumbs({ name, path }: { name: string; path: string }) {
  const base = getConfiguredSiteUrl()
  if (!base) return null
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: base },
        { '@type': 'ListItem', position: 2, name, item: `${base}${path}` },
      ],
    }} />
  )
}
