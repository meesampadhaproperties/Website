/**
 * Per-client configuration, in ONE place. Safe to import from client and server code (no Node-only imports).
 * Set these per client in Vercel (see A_Requirements/CLIENT_DEPLOYMENT_CHECKLIST.md).
 */

/** Brand name shown on the website, CRM, emails and reports. Env: NEXT_PUBLIC_COMPANY_NAME */
export const DEFAULT_COMPANY_NAME = 'Company'
export const COMPANY_NAME = (process.env.NEXT_PUBLIC_COMPANY_NAME || '').trim() || DEFAULT_COMPANY_NAME

/**
 * Brand shown on the PUBLIC website. Empty while the company name is still a placeholder ("CRM" or
 * "Company"), so the website never shows the word CRM (the CRM stays invisible to visitors).
 */
export const SITE_BRAND = /^(crm|company)$/i.test(COMPANY_NAME.trim()) ? '' : COMPANY_NAME

/** Page title for the public website: "About | Acme", or just "About" without a real brand. */
export const siteTitle = (page: string) => (SITE_BRAND ? `${page} | ${SITE_BRAND}` : page)

/** Public contact email for privacy and data-deletion requests (Privacy Policy page). Env: NEXT_PUBLIC_CONTACT_EMAIL */
export const CONTACT_EMAIL = (process.env.NEXT_PUBLIC_CONTACT_EMAIL || '').trim()

/** Date shown as "Last updated" on the Privacy Policy and Data Deletion pages. Change when their text changes. */
export const PRIVACY_POLICY_UPDATED = '23 November 2026'

/** Meta Graph API version used for Lead Ads, OAuth and WhatsApp. Change it here only. */
export const META_GRAPH_VERSION = 'v21.0'
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`

/**
 * The site's public URL, with no trailing slash. Env: NEXT_PUBLIC_SITE_URL.
 * SITE_URL / NEXT_PUBLIC_BASE_URL are still read as legacy fallbacks.
 */
export function getConfiguredSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Resolution order: configured URL → the request's own host → localhost (development only).
 * Never silently produces a localhost link in production.
 */
export function resolveSiteUrl(host?: string | null, proto?: string | null): string {
  const configured = getConfiguredSiteUrl()
  if (configured) return configured
  const h = (host || '').split(',')[0].trim()
  if (h) {
    const isLocal = h.startsWith('localhost') || h.startsWith('127.0.0.1')
    const p = (proto || '').split(',')[0].trim() || (isLocal ? 'http' : 'https')
    return `${p}://${h}`
  }
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  throw new Error('NEXT_PUBLIC_SITE_URL is not set. Add it in Vercel → Environment Variables.')
}

/**
 * Total file storage allowed by the client's Supabase plan (Free = 1 GB, Pro = 100 GB). Server env: STORAGE_LIMIT_GB.
 */
export function getStorageLimitBytes(): number {
  const gb = parseFloat(process.env.STORAGE_LIMIT_GB || '')
  return Math.round((gb > 0 ? gb : 1) * 1024 * 1024 * 1024)
}

/** Public business details shown in the website footer and in structured data (JSON-LD). */
export const SITE_CONTACT = {
  name: 'Mee Sampadha',
  tagline: 'The Future of Real Estate',
  address: {
    lines: ['1st Floor, H. No 12-6-2/269/3,', 'Near by PAI International,', 'Opp. BJP Office, Vivek Nagar,', 'Kukatpally, Hyderabad,', 'Telangana 500072'],
    street: '1st Floor, H. No 12-6-2/269/3, near PAI International, opp. BJP Office, Vivek Nagar, Kukatpally',
    locality: 'Hyderabad',
    region: 'Telangana',
    postalCode: '500072',
    country: 'IN',
  },
  phone: '+91 8977036622',
  phoneHref: 'tel:+918977036622',
  // TODO: replace with the WhatsApp CHATBOT number (digits only, with country code). Placeholder = office phone.
  whatsappNumber: '918977036622',
  emails: ['info@meesampadha.com', 'meesampadha@gmail.com'],
} as const

/** Social profiles. Leave a value empty and its icon is hidden. Fill in the real URLs. */
export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/meesampadha.properties/',
  facebook: 'https://www.facebook.com/profile.php?id=61597085094498',
  youtube: 'https://www.youtube.com/channel/UCP2_lvdFYHMyLF-GfQelPeA',
}

/** WhatsApp chat link with a prefilled message. */
export const whatsappLink = (message: string) => `https://wa.me/${SITE_CONTACT.whatsappNumber}?text=${encodeURIComponent(message)}`

/** Google Maps search link for the office address. */
export const MAPS_LINK = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Mee Sampadha, Vivek Nagar, Kukatpally, Hyderabad 500072')
