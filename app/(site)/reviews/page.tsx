import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/site/JsonLd'
import { whatsappLink } from '@/lib/site-config'
import { WhatsAppIcon } from '@/components/site/WhatsAppIcon'
import { DreamPropertyCta } from '@/components/site/DreamPropertyCta'
import { ReviewsList } from '@/components/site/ReviewsList'
import { AutoRefresh } from '@/components/site/AutoRefresh'
import { getPublishedReviews } from '@/lib/website-projects'

export const metadata: Metadata = {
  title: 'Customer Reviews | Mee Sampadha',
  description: 'Watch video reviews and project walkthroughs from Mee Sampadha, a real estate agency in Hyderabad.',
  alternates: { canonical: '/reviews' },
}

// Rebuilt at most every 5 minutes; saving in CRM → Website Projects refreshes it right away (revalidatePath).
export const revalidate = 300

const wrap = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-gold'

export default async function ReviewsPage() {
  const reviews = await getPublishedReviews()
  const hasReviews = reviews.length > 0

  return (
    <>
      <Breadcrumbs name="Reviews" path="/reviews" />
      <AutoRefresh />
      <section className="bg-site-ink text-white">
        <div className={`${wrap} ${hasReviews ? 'py-12 sm:py-16' : 'py-16 sm:py-24'}`}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Reviews</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75">
            {hasReviews
              ? 'Watch what buyers and visitors say about our projects.'
              : 'Video reviews are coming soon. Ask us on WhatsApp and we will connect you with buyers of the project you like.'}
            {' '}Want the project details? <Link href="/projects" className="font-semibold text-site-gold underline underline-offset-4">See our projects</Link>.
          </p>
          {!hasReviews && (
            <div className="mt-8">
              <a href={whatsappLink('Hi Mee Sampadha, I would like to talk to a buyer of your projects.')} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#25d366] text-site-ink hover:brightness-105`}>
                <WhatsAppIcon className="h-5 w-5" /> Chat on WhatsApp
              </a>
            </div>
          )}
        </div>
      </section>

      {hasReviews && <ReviewsList reviews={reviews} />}

      <DreamPropertyCta />
    </>
  )
}
