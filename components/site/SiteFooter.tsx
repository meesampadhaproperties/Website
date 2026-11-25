import Link from 'next/link'
import { Facebook, Instagram, Mail, MapPin, Phone, Youtube } from 'lucide-react'
import { SITE_CONTACT, SOCIAL_LINKS } from '@/lib/site-config'
import { LEGAL_NAV, SITE_NAV } from './nav'
import { SiteLogo } from './SiteLogo'

const socials = [
  { key: 'instagram', label: 'Instagram', href: SOCIAL_LINKS.instagram, Icon: Instagram },
  { key: 'facebook', label: 'Facebook', href: SOCIAL_LINKS.facebook, Icon: Facebook },
  { key: 'youtube', label: 'YouTube', href: SOCIAL_LINKS.youtube, Icon: Youtube },
]

const heading = 'text-base font-semibold uppercase tracking-widest text-site-gold'
const link = 'inline-flex min-h-11 items-center text-sm text-white/80 transition-colors hover:text-site-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold'

export function SiteFooter({ brand }: { brand: string }) {
  const { address } = SITE_CONTACT
  return (
    <footer className="relative isolate overflow-hidden border-t border-site-gold/20 bg-site-ink text-white">
      {/* Soft gold glow + skyline-style grid, echoing the reference footer */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_30%,rgba(245,176,64,0.22),transparent_55%),radial-gradient(ellipse_at_0%_0%,rgba(80,255,0,0.07),transparent_45%),linear-gradient(to_bottom,transparent_55%,rgba(245,176,64,0.08))]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-[repeating-linear-gradient(90deg,rgba(245,176,64,0.10)_0_2px,transparent_2px_26px)] [mask-image:linear-gradient(to_top,black,transparent)]" />

      <div className="mx-auto grid max-w-[90rem] gap-10 px-3 py-10 sm:px-6 sm:py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_1.4fr_0.9fr] lg:gap-12 lg:px-8">
        <div>
          <SiteLogo className="h-16 w-auto sm:h-20" sizes="(max-width: 640px) 120px, 160px" />
        </div>

        <nav aria-label="Quick links">
          <h2 className={heading}>Quick Links</h2>
          <ul className="mt-4 space-y-1">
            {SITE_NAV.map((item) => (
              <li key={item.href}><Link href={item.href} className={link}>{item.label}</Link></li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className={heading}>Contact</h2>
          <address className="mt-4 space-y-1 text-sm leading-relaxed not-italic text-white/85">
            <p className="flex gap-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-site-green" aria-hidden />
              <span>{address.lines.map((l) => <span key={l} className="block">{l}</span>)}</span>
            </p>
            <p className="flex items-center gap-4">
              <Phone className="h-5 w-5 shrink-0 text-site-green" aria-hidden />
              <a href={SITE_CONTACT.phoneHref} className="inline-flex min-h-11 items-center hover:text-site-gold">{SITE_CONTACT.phone}</a>
            </p>
            {SITE_CONTACT.emails.map((email) => (
              <p key={email} className="flex items-center gap-4">
                <Mail className="h-5 w-5 shrink-0 text-site-green" aria-hidden />
                <a href={`mailto:${email}`} className="inline-flex min-h-11 items-center break-all hover:text-site-gold">{email}</a>
              </p>
            ))}
          </address>
        </div>

        <div>
          <h2 className={heading}>Follow Us</h2>
          <ul className="mt-4 flex gap-4" aria-label="Social media">
            {socials.map(({ key, label, href, Icon }) => {
              const cls = 'flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors'
              return (
                <li key={key}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                      className={`${cls} hover:bg-site-gold hover:text-site-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold`}>
                      <Icon className="h-5 w-5" />
                    </a>
                  ) : (
                    // No profile URL set yet in lib/site-config.ts: shown, but not a link.
                    <span className={cls} role="img" aria-label={`${label} (coming soon)`}><Icon className="h-5 w-5" /></span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-4 max-w-[16rem] text-sm text-white/60">Follow us for new projects and updates.</p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-1 px-3 pb-24 pt-4 text-sm text-white/60 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:px-6 sm:pb-4 sm:pr-24 lg:px-8 lg:pr-28">
          <p>© {new Date().getFullYear()} {brand || SITE_CONTACT.name}. All rights reserved.</p>
          <nav aria-label="Legal" className="flex gap-4">
            {LEGAL_NAV.map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center hover:text-site-gold">{item.label}</Link>)}
          </nav>
        </div>
      </div>
    </footer>
  )
}
