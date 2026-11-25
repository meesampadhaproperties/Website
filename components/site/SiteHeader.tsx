'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { SITE_NAV } from './nav'
import { SiteLogo } from './SiteLogo'

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <header className="sticky top-0 z-40 border-b border-site-gold/20 bg-site-ink/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-[90rem] grid-cols-[1fr_auto_1fr] items-center px-3 sm:h-20 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Mee Sampadha home" className="flex shrink-0 items-center justify-self-start rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-site-gold">
          <SiteLogo priority className="h-11 w-auto sm:h-16" />
        </Link>

        <nav className="hidden items-center justify-center gap-2 sm:flex" aria-label="Main">
          {SITE_NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative min-h-11 inline-flex items-center rounded-lg px-4 text-sm font-medium tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold ${
                  active ? 'text-site-gold' : 'text-white/80 hover:text-site-gold'
                }`}
              >
                {item.label}
                {active && <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-site-gold" aria-hidden />}
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="col-start-3 flex h-11 w-11 items-center justify-center justify-self-end rounded-lg text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold sm:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-site-gold/20 bg-site-ink px-4 py-2 sm:hidden" aria-label="Mobile">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex min-h-12 items-center rounded-lg px-3 text-base font-medium ${
                isActive(item.href) ? 'bg-white/5 text-site-gold' : 'text-white/80'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
