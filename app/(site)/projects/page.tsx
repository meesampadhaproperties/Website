import type { Metadata } from 'next'
import { Phone } from 'lucide-react'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/site/JsonLd'
import { SITE_CONTACT, whatsappLink } from '@/lib/site-config'
import { WhatsAppIcon } from '@/components/site/WhatsAppIcon'
import { DreamPropertyCta } from '@/components/site/DreamPropertyCta'

export const metadata: Metadata = {
  title: 'Projects: Flats, Villas & Plots in Hyderabad | Mee Sampadha',
  description: 'Browse Mee Sampadha projects in Hyderabad by property type: flats, villas, houses, open plots, farm lands and commercial plots. Ask for current availability.',
  alternates: { canonical: '/projects' },
}

const wrap = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-gold'

export default function ProjectsPage() {
  return (
    <>
      <Breadcrumbs name="Projects" path="/projects" />
      <section className="bg-site-ink text-white">
        <div className={`${wrap} py-16 sm:py-24`}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Our projects</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75">Flats, villas, houses, plots and farm lands across Hyderabad. Availability changes often, so ask us for the projects open right now in your budget and area. New here? <Link href="/about" className="font-semibold text-site-gold underline underline-offset-4">Learn about Mee Sampadha</Link>.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={whatsappLink('Hi Mee Sampadha, please share your current projects.')} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#25d366] text-site-ink hover:brightness-105`}>
              <WhatsAppIcon className="h-5 w-5" /> Get current projects
            </a>
            <a href={SITE_CONTACT.phoneHref} className={`${btn} border border-white/30 text-white hover:border-site-gold hover:text-site-gold`}>
              <Phone className="h-5 w-5" aria-hidden /> Call {SITE_CONTACT.phone}
            </a>
          </div>
        </div>
      </section>

      <DreamPropertyCta />
    </>
  )
}
