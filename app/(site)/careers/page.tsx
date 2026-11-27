import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/site/JsonLd'
import { CareersForm } from '@/components/site/CareersForm'

export const metadata: Metadata = {
  title: 'Careers | Mee Sampadha',
  description: 'Join the Mee Sampadha team in Hyderabad. Share your name, mobile number and email and we will contact you.',
  alternates: { canonical: '/careers' },
}

const wrap = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'

export default function CareersPage() {
  return (
    <>
      <Breadcrumbs name="Careers" path="/careers" />
      <section className="bg-site-ink text-white">
        <div className={`${wrap} grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1fr] lg:gap-16`}>
          <div>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Careers</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">
              Want to work with a Hyderabad real estate team that values honest advice? Share your details and we will get in touch.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-7">
            <h2 className="mb-4 font-display text-xl font-semibold">Your details</h2>
            <CareersForm />
          </div>
        </div>
      </section>
    </>
  )
}
