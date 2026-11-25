import { Phone } from 'lucide-react'
import { SITE_CONTACT } from '@/lib/site-config'
import { EnquiryForm } from './EnquiryForm'

// Shown at the bottom of every public page (rendered from the site layout).
export function EnquirySection({ asPage = false }: { asPage?: boolean }) {
  const Title = asPage ? 'h1' : 'h2'
  return (
    <section id="enquiry" aria-labelledby="enquiry-title" className={`scroll-mt-20 bg-site-gold text-site-ink ${asPage ? 'flex flex-1 items-center' : ''}`}>
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14 lg:px-8">
        <div>
          <Title id="enquiry-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Send us an enquiry</Title>
          <p className="mt-3 max-w-md text-lg text-site-ink/80">Tell us what you are looking for and an agent will contact you. We only need three things.</p>
          <a href={SITE_CONTACT.phoneHref} className="mt-4 inline-flex min-h-12 items-center gap-3 text-lg font-semibold text-site-ink underline decoration-site-ink/40 underline-offset-4">
            <Phone className="h-5 w-5" aria-hidden /> Prefer to talk? {SITE_CONTACT.phone}
          </a>
        </div>
        <div className="rounded-2xl bg-site-ink p-5 text-white shadow-xl shadow-black/20 sm:p-6"><EnquiryForm /></div>
      </div>
    </section>
  )
}
