import { Facebook, Instagram, Youtube } from 'lucide-react'
import { SOCIAL_LINKS } from '@/lib/site-config'

const socials = [
  { key: 'instagram', label: 'Instagram', href: SOCIAL_LINKS.instagram, Icon: Instagram },
  { key: 'facebook', label: 'Facebook', href: SOCIAL_LINKS.facebook, Icon: Facebook },
  { key: 'youtube', label: 'YouTube', href: SOCIAL_LINKS.youtube, Icon: Youtube },
]

/** Instagram, Facebook and YouTube round buttons. One look for the footer and the home page banner. */
export function SocialLinks({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex gap-4 ${className}`} aria-label="Social media">
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
  )
}
