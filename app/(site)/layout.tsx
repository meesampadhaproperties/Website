import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Figtree } from 'next/font/google'
import { SITE_BRAND, SITE_CONTACT, SOCIAL_LINKS, getConfiguredSiteUrl } from '@/lib/site-config'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { WhatsAppFab } from '@/components/site/WhatsAppFab'
import { SplashScreen } from '@/components/site/SplashScreen'
import { LazyEnquiryPopup } from '@/components/site/LazyEnquiryPopup'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

const siteUrl = getConfiguredSiteUrl()

// Defaults for every public page; individual pages override title/description.
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: `${SITE_CONTACT.name} | ${SITE_CONTACT.tagline} in Hyderabad`, template: `%s` },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  description: 'Mee Sampadha helps you buy apartments, villas and plots in Hyderabad, Telangana. Browse properties and talk to a trusted real estate agent.',
  openGraph: { type: 'website', siteName: SITE_CONTACT.name, locale: 'en_IN', images: [{ url: '/brand/og.png', width: 1200, height: 630, alt: 'Mee Sampadha – The Future of Real Estate' }] },
  twitter: { card: 'summary_large_image', images: ['/brand/og.png'] },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#07090a' }

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  name: SITE_CONTACT.name,
  slogan: SITE_CONTACT.tagline,
  ...(siteUrl ? { url: siteUrl, logo: `${siteUrl}/brand/logo.png`, image: `${siteUrl}/brand/logo.png` } : {}),
  telephone: SITE_CONTACT.phone,
  email: SITE_CONTACT.emails[0],
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE_CONTACT.address.street,
    addressLocality: SITE_CONTACT.address.locality,
    addressRegion: SITE_CONTACT.address.region,
    postalCode: SITE_CONTACT.address.postalCode,
    addressCountry: SITE_CONTACT.address.country,
  },
  areaServed: 'Hyderabad, Telangana',
  ...(Object.values(SOCIAL_LINKS).some(Boolean) ? { sameAs: Object.values(SOCIAL_LINKS).filter(Boolean) } : {}),
}

// Public website shell (Home / About / Projects). The CRM lives at /crm with its own layout.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} flex min-h-screen flex-col bg-white font-body`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <SplashScreen />
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter brand={SITE_BRAND} />
      <WhatsAppFab />
      <LazyEnquiryPopup />
    </div>
  )
}
