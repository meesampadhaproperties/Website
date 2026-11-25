import Image from 'next/image'
import { SITE_CONTACT } from '@/lib/site-config'

// The logo has a white roof and a pale-mint "MEE", so it only reads on dark backgrounds.
export function SiteLogo({ className = 'h-11 w-auto', priority = false, sizes = '(max-width: 640px) 100px, 160px' }: { className?: string; priority?: boolean; sizes?: string }) {
  return (
    <Image
      src="/brand/logo.png"
      alt={`${SITE_CONTACT.name} – ${SITE_CONTACT.tagline}`}
      width={1500}
      height={800}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  )
}
