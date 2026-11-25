import type { Metadata } from 'next'
import { EnquirySection } from '@/components/site/EnquirySection'
import { Breadcrumbs } from '@/components/site/JsonLd'

export const metadata: Metadata = {
  title: 'Send an Enquiry | Mee Sampadha, Hyderabad Real Estate',
  description: 'Tell Mee Sampadha what you are looking for: a flat, villa, plot or land in Hyderabad. Share your name, mobile number and a message and an agent will contact you.',
  alternates: { canonical: '/enquiry' },
}

// Stand-alone enquiry page: a link you can share from ads, social profiles or the WhatsApp bot.
export default function EnquiryPage() {
  return (
    <>
      <Breadcrumbs name="Enquiry" path="/enquiry" />
      <EnquirySection asPage />
    </>
  )
}
