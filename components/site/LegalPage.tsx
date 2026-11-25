import { CONTACT_EMAIL } from '@/lib/site-config'
import { EnquirySection } from './EnquirySection'

/** Shared layout for the Privacy Policy and Data Deletion pages: readable prose at phone width. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
      <div className="mt-8 space-y-8 text-[15px] leading-7 text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_a]:font-medium [&_a]:text-slate-900 [&_a]:underline">
        {children}
      </div>
    </article>
    <EnquirySection />
    </>
  )
}

/** The contact line used on both pages: the configured email, or a generic fallback. */
export function ContactLine() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <span>the contact details on this website</span>
  )
}
