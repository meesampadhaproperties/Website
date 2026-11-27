import type { Metadata } from 'next'
import { BadgeCheck, Building2, Compass, Eye, FileText, Handshake, HeartHandshake, House, KeyRound, LandPlot, ListChecks, MapPinned, Search, ShieldCheck, Sofa, Landmark, Target } from 'lucide-react'
import { SITE_CONTACT } from '@/lib/site-config'
import { DreamPropertyCta } from '@/components/site/DreamPropertyCta'
import { Reveal } from '@/components/site/Reveal'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/site/JsonLd'
import { AboutHeroArt } from '@/components/site/AboutHeroArt'

export const metadata: Metadata = {
  title: 'About Mee Sampadha | Real Estate Agents in Hyderabad',
  description: 'Mee Sampadha is a real estate agency in Gajularamaram, Hyderabad. We help buyers find flats, villas, houses and plots, and help with interiors and loans, with honest, clear guidance.',
  alternates: { canonical: '/about' },
}

const wrap = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
const h2 = 'font-display text-3xl font-semibold tracking-tight sm:text-4xl'

const deals = [
  { Icon: Building2, title: 'Flats and apartments', text: 'Ready-to-move and under-construction homes in gated communities and standalone buildings.' },
  { Icon: House, title: 'Villas and houses', text: 'Independent homes with space and privacy for a growing family.' },
  { Icon: LandPlot, title: 'Open plots', text: 'Residential plots in approved layouts to build on or hold as an investment.' },
  { Icon: Sofa, title: 'Interior', text: 'Design and finishing for your new home, so it is ready to live in.' },
  { Icon: Landmark, title: 'Loan services', text: 'Help with home and plot loans, from choosing a lender to completing the paperwork.' },
]

const services = [
  { Icon: Search, title: 'Property search and shortlisting', text: 'Share your budget, area and property type. We send options that fit, not a long list to sort through.' },
  { Icon: MapPinned, title: 'Site visits', text: 'We arrange visits and meet you there, so you see the property and ask questions on the spot.' },
  { Icon: FileText, title: 'Documents explained', text: 'We tell you which documents to ask for and what to check before you pay a booking amount.' },
  { Icon: KeyRound, title: 'Booking and paperwork support', text: 'We stay with you through booking and registration so nothing is missed.' },
]

const values = [
  { Icon: ShieldCheck, title: 'Honest advice', text: 'If a property is not right for you, we say so.' },
  { Icon: BadgeCheck, title: 'Clear information', text: 'Prices, costs and terms explained before you decide, not after.' },
  { Icon: Handshake, title: 'Long-term relationships', text: 'Many families come back for their next property. That is how we measure success.' },
]

const mission = [
  { Icon: Compass, title: 'Guide with clarity', text: 'Explain prices, documents and costs in plain language, so you know what you are signing.' },
  { Icon: ListChecks, title: 'Respect your time', text: 'Shortlist properties that fit your budget and area instead of sending you everything.' },
  { Icon: HeartHandshake, title: 'Stay with you', text: 'Support you from the first enquiry through site visits, booking and paperwork.' },
]

export default function AboutPage() {
  return (
    <>
      <Breadcrumbs name="About" path="/about" />
      <section className="relative isolate overflow-hidden bg-[#f5f1e8]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-site-gold/25 blur-3xl" />
        <div className={`${wrap} grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16`}>
          <div>
            <h1 className="rise-in whitespace-nowrap font-display text-[1.65rem] font-semibold leading-[1.1] tracking-tight text-site-ink min-[400px]:text-3xl sm:text-5xl lg:text-[3.25rem]">About Mee Sampadha</h1>
            <p className="rise-in mt-5 max-w-xl text-lg leading-relaxed text-slate-700" style={{ '--d': '150ms' } as React.CSSProperties}>
              {SITE_CONTACT.tagline}. A Hyderabad real estate agency helping families buy flats, villas, plots and land with honest guidance.
            </p>
            <dl className="rise-in mt-8 flex max-w-xl flex-wrap gap-x-10 gap-y-5 border-t-2 border-site-ink pt-6" style={{ '--d': '300ms' } as React.CSSProperties}>
              <div><dt className="text-sm text-slate-600">Office</dt><dd className="mt-1 whitespace-nowrap font-display text-lg font-semibold text-site-ink">Gajularamaram, Hyderabad</dd></div>
              <div><dt className="text-sm text-slate-600">We deal in</dt><dd className="mt-1 whitespace-nowrap font-display text-lg font-semibold text-site-ink">Flats, villas, plots and land</dd></div>
            </dl>
          </div>
          <AboutHeroArt className="mx-auto h-auto w-full max-w-md lg:max-w-none" />
        </div>
      </section>

      <section className={`${wrap} grid gap-10 py-16 sm:py-24 lg:grid-cols-2`}>
        <Reveal>
          <h2 className={`${h2} text-site-ink`}>What the name means</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">In Telugu, “Mee” means “your” and “Sampadha” means wealth. A home or a plot is usually the biggest purchase a family makes, so we treat it that way.</p>
        </Reveal>
        <Reveal delay={120}>
          <h2 className={`${h2} text-site-ink`}>What we do</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">We help buyers find the right property in Hyderabad. You tell us your budget and area, we shortlist suitable options, arrange site visits and support you through booking.</p>
        </Reveal>
      </section>

      <section className="bg-site-panel text-white" aria-labelledby="deals-title">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Reveal>
            <h2 id="deals-title" className={h2}>Property we deal in</h2>
            <p className="mt-3 max-w-xl text-white/70">From a first flat to a plot for the future, here is what we can help you find.</p>
          </Reveal>
          <ul className="mt-10 flex flex-wrap justify-center gap-5">
            {deals.map(({ Icon, title, text }, i) => (
              <li key={title} className="w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.84rem)]">
                <Reveal delay={i * 90} className="group h-full rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:border-site-gold/60 hover:bg-white/10">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-site-gold/15 text-site-gold transition-transform duration-300 group-hover:scale-110"><Icon className="h-6 w-6" aria-hidden /></span>
                  <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-white/70">{text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-[#f5f1e8]" aria-labelledby="vision-title">
        <div className={`${wrap} grid gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_1.3fr] lg:gap-16`}>
          <Reveal>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-site-ink text-site-gold" aria-hidden><Eye className="h-7 w-7" /></span>
            <h2 id="vision-title" className={`${h2} mt-5 text-site-ink`}>Our vision</h2>
            <p className="mt-4 text-xl leading-relaxed text-slate-800">To be the real estate partner Hyderabad families trust first, where every buyer finds property that fits their budget and their future.</p>
          </Reveal>
          <Reveal delay={120}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-site-ink text-site-gold" aria-hidden><Target className="h-7 w-7" /></span>
            <h2 className={`${h2} mt-5 text-site-ink`}>Our mission</h2>
            <p className="mt-4 text-xl leading-relaxed text-slate-800">To make buying property simple, honest and stress-free.</p>
            <ul className="mt-6 space-y-5">
              {mission.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-4 border-l-4 border-site-gold pl-4">
                  <Icon className="mt-1 h-6 w-6 shrink-0 text-[#b87a10]" aria-hidden />
                  <div><h3 className="font-display text-xl font-semibold text-site-ink">{title}</h3><p className="mt-1 text-slate-700">{text}</p></div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className={`${wrap} py-16 sm:py-24`} aria-labelledby="help-title">
        <Reveal>
          <h2 id="help-title" className={`${h2} text-site-ink`}>How we help you buy</h2>
          <p className="mt-3 max-w-xl text-slate-600">One agent, from your first call to the day you book. See the <Link href="/projects" className="font-semibold text-site-ink underline decoration-site-gold underline-offset-4">projects we are showing now</Link> or <Link href="/enquiry" className="font-semibold text-site-ink underline decoration-site-gold underline-offset-4">tell us what you need</Link>.</p>
        </Reveal>
        <ul className="mt-10 divide-y divide-site-ink/15 border-y border-site-ink/15">
          {services.map(({ Icon, title, text }, i) => (
            <li key={title}>
              <Reveal delay={i * 80} className="grid gap-3 py-6 transition-colors hover:bg-site-gold/10 sm:grid-cols-[auto_1fr_1.4fr] sm:items-center sm:gap-8 sm:px-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-site-ink text-site-gold" aria-hidden><Icon className="h-6 w-6" /></span>
                <h3 className="font-display text-xl font-semibold text-site-ink sm:text-2xl">{title}</h3>
                <p className="text-slate-600">{text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-site-ink text-white" aria-labelledby="values-title">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Reveal><h2 id="values-title" className={h2}>What we stand for</h2></Reveal>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {values.map(({ Icon, title, text }, i) => (
              <li key={title}>
                <Reveal delay={i * 120} className="border-t-2 border-site-gold pt-5">
                  <Icon className="h-8 w-8 text-site-gold" aria-hidden />
                  <h3 className="mt-4 font-display text-2xl font-semibold">{title}</h3>
                  <p className="mt-2 text-white/70">{text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <DreamPropertyCta />
    </>
  )
}
