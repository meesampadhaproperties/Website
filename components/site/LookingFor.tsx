import { whatsappLink } from '@/lib/site-config'
import { WhatsAppIcon } from './WhatsAppIcon'

const lookingFor = [
  { title: 'Apartments', text: 'Ready-to-move and under-construction flats across Hyderabad. Share your budget and preferred area and we shortlist.', ask: 'I am looking for an apartment in Hyderabad.' },
  { title: 'Villas and independent houses', text: 'Homes with more space and privacy for a growing family, in the localities you are considering.', ask: 'I am looking for a villa or independent house in Hyderabad.' },
  { title: 'Open plots', text: 'Land to build on or to hold as an investment. We help you compare layouts, locations and prices.', ask: 'I am looking for an open plot in Hyderabad.' },
]

/** "What are you looking for?" rows: each opens WhatsApp with the message already written. */
export function LookingFor({ headingId = 'looking-for-title' }: { headingId?: string }) {
  return (
    <>
      <h2 id={headingId} className="font-display text-3xl font-semibold tracking-tight text-site-ink sm:text-4xl">What are you looking for?</h2>
      <p className="mt-3 max-w-xl text-slate-600">Pick one and start a WhatsApp chat with the message already written.</p>
      <ul className="mt-10 divide-y divide-site-ink/15 border-y border-site-ink/15">
        {lookingFor.map((item) => (
          <li key={item.title}>
            <a href={whatsappLink(`Hi Mee Sampadha, ${item.ask}`)} target="_blank" rel="noopener noreferrer"
              className="group grid min-h-24 gap-2 py-6 transition-colors hover:bg-site-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold sm:grid-cols-[1fr_1.4fr_auto] sm:items-center sm:gap-8 sm:px-4">
              <h3 className="font-display text-2xl font-semibold text-site-ink">{item.title}</h3>
              <p className="text-slate-600">{item.text}</p>
              <span className="inline-flex min-h-11 items-center gap-2 font-semibold text-site-ink group-hover:text-[#b87a10]">
                <WhatsAppIcon className="h-5 w-5" /> Ask on WhatsApp
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
