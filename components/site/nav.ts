// Public navigation. The CRM (/crm) is intentionally NOT linked anywhere on the public site.
export const SITE_NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/projects', label: 'Projects' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/knowledge-base', label: 'Knowledge base' },
]

// Extra footer-only quick link (not in the header menu).
export const FOOTER_EXTRA_NAV = [
  { href: '/careers', label: 'Careers' },
]

// Footer-only legal links. /data-deletion is NOT linked (owner's choice) but stays live:
// it is the Meta app's "User data deletion URL".
export const LEGAL_NAV = [
  { href: '/privacy', label: 'Privacy & Policy' },
]
