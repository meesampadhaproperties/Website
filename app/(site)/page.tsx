import type { Metadata } from 'next'
import { CheckCircle2, Phone } from 'lucide-react'
import { WhatsAppIcon } from '@/components/site/WhatsAppIcon'
import { SITE_CONTACT, whatsappLink } from '@/lib/site-config'
import { Roofline } from '@/components/site/Roofline'
import { HeroSun } from '@/components/site/HeroSun'
import { HowItWorks } from '@/components/site/HowItWorks'
import { LookingFor } from '@/components/site/LookingFor'
import { Reveal } from '@/components/site/Reveal'
import Link from 'next/link'
import { JsonLd } from '@/components/site/JsonLd'
import { getConfiguredSiteUrl } from '@/lib/site-config'
import { EnquirySection } from '@/components/site/EnquirySection'

export const metadata: Metadata = {
  title: 'Mee Sampadha | Apartments, Villas & Plots in Hyderabad',
  description: 'Buy apartments, villas and open plots in Hyderabad with Mee Sampadha. Tell us your budget and area, and an agent will shortlist options and arrange site visits.',
  alternates: { canonical: '/' },
}

const commitments = [
  { title: 'A direct line to an agent', text: 'Call or WhatsApp the person handling your search. No call centre, no forms to wait on.' },
  { title: 'Shortlists, not endless listings', text: 'You get options that fit your budget, area and timeline, so you spend your weekends on the right sites.' },
  { title: 'Site visits arranged for you', text: 'We schedule visits, meet you there and answer questions about the project on the spot.' },
  { title: 'Plain answers on paperwork', text: 'We tell you which documents to ask for and what to check before you pay a booking amount.' },
]

const steps = [
  { title: 'Tell us what you need', text: 'Call or message us with your budget, preferred area and the kind of property.' },
  { title: 'We shortlist for you', text: 'An agent sends options that match, so you only look at what is relevant.' },
  { title: 'Visit the sites', text: 'We arrange the visits and answer your questions on the spot.' },
  { title: 'Book with support', text: 'We stay with you through booking and paperwork.' },
]

const flatChecks = [
  'RERA registration number of the project, verified on the official Telangana RERA website',
  'Approved building plan and the builder’s past completed projects',
  'Agreement of sale terms: price, payment schedule, possession date and penalties',
  'What the price includes: parking, club house, maintenance deposit and corpus fund',
  'GST on under-construction flats, plus stamp duty and registration charges',
]
const plotChecks = [
  'Approved layout from HMDA or DTCP, with the layout permission number',
  'Clear title: the sale deed history for the plot over the past years',
  'Encumbrance Certificate showing no loans or disputes on the land',
  'Plot dimensions, road width and access, confirmed on site',
  'Stamp duty and registration charges, and who pays for what',
]

const faqs = [
  { q: 'How do I get started?', a: 'Call or WhatsApp us with your budget, preferred area and the type of property: apartment, villa or plot. An agent will send a shortlist and arrange site visits for the ones you like.' },
  { q: 'Should I buy a ready-to-move or an under-construction flat?', a: 'A ready-to-move flat lets you see exactly what you are buying and move in soon. Under-construction flats usually cost less upfront and let you pay in stages, but you wait for possession and depend on the builder’s delivery. Check the project’s RERA registration either way.' },
  { q: 'What is RERA and how do I check a project?', a: 'RERA is the Real Estate (Regulation and Development) Act. In Telangana, eligible projects must be registered with the state RERA authority. Ask the builder for the registration number and check it on the official Telangana RERA website before you pay anything.' },
  { q: 'Which documents should I check before buying a plot?', a: 'Look at the approved layout (HMDA or DTCP), the sale deed history, the Encumbrance Certificate and the plot’s measurements on site. Have a property lawyer review the documents before you sign.' },
  { q: 'What costs come on top of the property price?', a: 'Expect stamp duty and registration charges, GST on under-construction flats, and for apartments a maintenance deposit and corpus fund. Confirm current rates with the sub-registrar office or a professional.' },
  { q: 'Which area of Hyderabad should I choose?', a: 'It depends on where you work, your budget and the commute. Areas near the Metro or the IT corridor cost more, while outer areas offer lower prices and more space. Tell us your workplace and budget and we will suggest areas to visit.' },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

const wrap = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-gold'
const h2 = 'font-display text-3xl font-semibold tracking-tight sm:text-4xl'

export default function HomePage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      {getConfiguredSiteUrl() && <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_CONTACT.name, url: getConfiguredSiteUrl(), inLanguage: 'en-IN' }} />}

      <section className="relative isolate overflow-hidden bg-site-ink text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,rgba(245,176,64,0.18),transparent_55%)]" />
        {/* Sun with rays: rises once on load, sits behind the copy on small screens */}
        <HeroSun className="absolute right-2 top-1 -z-10 h-20 w-20 opacity-70 sm:right-[8%] sm:top-16 sm:h-44 sm:w-44 sm:opacity-100 lg:h-52 lg:w-52" />
        <div className={`${wrap} pb-60 pt-16 sm:pb-72 sm:pt-24`}>
          <h1 className="rise-in max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Find your home, apartment or land in Hyderabad
          </h1>
          <p className="rise-in mt-6 max-w-xl text-lg leading-relaxed text-white/75" style={{ '--d': '150ms' } as React.CSSProperties}>
            Mee Sampadha means “your wealth”. We help you choose property you will be glad to own, from the first enquiry to the site visit, with an agent you can call directly.
          </p>
          <div className="rise-in mt-8 flex flex-col gap-3 sm:flex-row" style={{ '--d': '300ms' } as React.CSSProperties}>
            <a href={SITE_CONTACT.phoneHref} className={`${btn} bg-site-gold text-site-ink hover:brightness-110`}>
              <Phone className="h-5 w-5" aria-hidden /> Call {SITE_CONTACT.phone}
            </a>
            <a href={whatsappLink('Hi Mee Sampadha, I would like to know about available properties.')} target="_blank" rel="noopener noreferrer" className={`${btn} border border-white/30 text-white hover:border-site-green hover:text-site-green`}>
              <WhatsAppIcon className="h-5 w-5" /> Chat on WhatsApp
            </a>
          </div>
        </div>
        <a href="#looking-for" aria-label="Scroll down to explore" className="scroll-cue absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-white/70 transition-colors hover:text-site-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-site-gold">
          <span className="flex h-11 w-7 justify-center rounded-full border-2 border-current pt-2">
            <span className="scroll-cue-wheel h-2 w-1 rounded-full bg-site-gold" />
          </span>
          <span className="text-xs tracking-wide">Scroll</span>
        </a>
        <Roofline className="absolute inset-x-0 bottom-[5.5rem] h-36 w-full sm:h-48" />
      </section>

      <section id="looking-for" className={`${wrap} scroll-mt-20 py-16 sm:py-24`} aria-labelledby="looking-for-title">
        <Reveal><LookingFor /></Reveal>
      </section>

      <section className="bg-[#f5f1e8]" aria-labelledby="why-us">
        <div className={`${wrap} grid gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_1.6fr]`}>
          <div>
            <h2 id="why-us" className={`${h2} text-site-ink`}>Buying property is a big decision. We keep it simple.</h2>
            <p className="mt-5 max-w-md text-slate-700">Read <Link href="/about" className="font-semibold text-site-ink underline decoration-site-gold underline-offset-4">more about Mee Sampadha</Link>, see our <Link href="/projects" className="font-semibold text-site-ink underline decoration-site-gold underline-offset-4">current projects</Link>, or <Link href="/enquiry" className="font-semibold text-site-ink underline decoration-site-gold underline-offset-4">send us an enquiry</Link>.</p>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {commitments.map((c, i) => (
              <Reveal key={c.title} delay={i * 100} className="border-l-4 border-site-gold pl-5">
                <dt className="font-display text-xl font-semibold text-site-ink">{c.title}</dt>
                <dd className="mt-2 text-slate-700">{c.text}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-site-panel text-white" aria-labelledby="how-it-works">
        <div className={`${wrap} py-16 sm:py-24`}>
          <h2 id="how-it-works" className={h2}>How it works</h2>
          <HowItWorks steps={steps} />
        </div>
      </section>

      <section className="bg-site-ink text-white" aria-labelledby="checklist">
        <div className={`${wrap} py-16 sm:py-24`}>
          <h2 id="checklist" className={h2}>Before you pay a booking amount</h2>
          <p className="mt-3 max-w-2xl text-white/70">A short checklist to run through for any property you like. It is general guidance, not legal advice, so have a property lawyer review the documents.</p>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            {[{ title: 'Buying an apartment', items: flatChecks }, { title: 'Buying a plot', items: plotChecks }].map((g, gi) => (
              <Reveal key={g.title} delay={gi * 150}>
                <h3 className="font-display text-2xl font-semibold text-site-gold">{g.title}</h3>
                <ul className="mt-4 space-y-3">
                  {g.items.map((item) => (
                    <li key={item} className="flex gap-3 text-white/85">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-site-green" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {g.title === 'Buying a plot' && (
                  <a href={whatsappLink('Hi Mee Sampadha, I would like to talk to someone about buying property.')} target="_blank" rel="noopener noreferrer" className={`${btn} mt-8 w-full bg-site-gold text-site-ink hover:brightness-110 sm:w-auto`}>
                    <WhatsAppIcon className="h-5 w-5" /> Talk to us
                  </a>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={`${wrap} grid gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_1.6fr]`} aria-labelledby="faq">
        <div>
          <h2 id="faq" className={`${h2} text-site-ink`}>Common questions</h2>
          <p className="mt-3 text-slate-600">Cannot find your answer? <a className="font-semibold text-site-ink underline decoration-site-gold underline-offset-4" href={SITE_CONTACT.phoneHref}>Call us</a> and ask.</p>
        </div>
        <div className="divide-y divide-site-ink/15 border-y border-site-ink/15">
          {faqs.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-display text-lg font-semibold text-site-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-2xl text-site-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-4 text-slate-700">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <EnquirySection />
    </>
  )
}
