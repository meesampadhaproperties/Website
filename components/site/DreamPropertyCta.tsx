import { Phone } from 'lucide-react'
import { SITE_CONTACT, whatsappLink } from '@/lib/site-config'
import { WhatsAppIcon } from './WhatsAppIcon'

const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-ink'

export function DreamPropertyCta() {
  return (
    <section className="bg-site-gold text-site-ink" aria-labelledby="book">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="max-w-2xl">
          <h2 id="book" className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Find your dream property</h2>
          <p className="mt-4 text-lg text-site-ink/80">Tell us your budget and preferred area, and we will line up options to see.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row md:flex-col lg:flex-row">
          <a href={whatsappLink('Hi Mee Sampadha, I would like to find a property. Please contact me.')} target="_blank" rel="noopener noreferrer" className={`${btn} bg-site-ink text-white hover:bg-site-panel`}>
            <WhatsAppIcon className="h-5 w-5" /> Contact us
          </a>
          <a href={SITE_CONTACT.phoneHref} className={`${btn} border-2 border-site-ink text-site-ink hover:bg-site-ink hover:text-white`}>
            <Phone className="h-5 w-5" aria-hidden /> Call {SITE_CONTACT.phone}
          </a>
        </div>
      </div>
    </section>
  )
}
