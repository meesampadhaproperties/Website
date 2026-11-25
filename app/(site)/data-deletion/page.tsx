import type { Metadata } from 'next'
import Link from 'next/link'
import { PRIVACY_POLICY_UPDATED, SITE_BRAND, siteTitle } from '@/lib/site-config'
import { ContactLine, LegalPage } from '@/components/site/LegalPage'

export const metadata: Metadata = {
  title: siteTitle('Delete your data'),
  alternates: { canonical: '/data-deletion' },
  robots: { index: false, follow: true }, // compliance page for Meta; no search value
  description: `How to ask ${SITE_BRAND || 'us'} to delete your personal information.`,
}

// Public data-deletion instructions. Also the "User data deletion URL" for the Meta app.
export default function DataDeletionPage() {
  return (
    <LegalPage title="Delete your data" updated={PRIVACY_POLICY_UPDATED}>
      <p>
        You can ask {SITE_BRAND || 'us'} to delete the personal information we hold about you, including information
        from lead forms you submitted on Facebook or Instagram.
      </p>

      <section>
        <h2>How to request deletion</h2>
        <ol>
          <li>Contact us at <ContactLine />.</li>
          <li>Write &quot;Delete my data&quot; and include the phone number (and email, if any) you used in your enquiry, so we can find your records.</li>
          <li>We will delete your information from our systems within 30 days and confirm to you once it is done.</li>
        </ol>
      </section>

      <section>
        <h2>What gets deleted</h2>
        <p>
          Your contact details, enquiry details, form answers and our notes about you. We may keep only what the law
          requires us to keep (for example, records of a completed purchase).
        </p>
      </section>

      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for more about how we handle your information.
      </p>
    </LegalPage>
  )
}
