import type { Metadata } from 'next'
import Link from 'next/link'
import { PRIVACY_POLICY_UPDATED, SITE_BRAND, siteTitle } from '@/lib/site-config'
import { ContactLine, LegalPage } from '@/components/site/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy | Mee Sampadha',
  alternates: { canonical: '/privacy' },
  description: `How ${SITE_BRAND || 'we'} collect${SITE_BRAND ? 's' : ''}, use${SITE_BRAND ? 's' : ''} and protect${SITE_BRAND ? 's' : ''} your personal information when you use this website, send an enquiry or contact us on WhatsApp.`,
}

// Public Privacy Policy. Also the "Privacy Policy URL" for the Meta app (Lead Ads + WhatsApp).
export default function PrivacyPage() {
  // Placeholder names ("CRM") are never shown on the public site
  const name = SITE_BRAND || 'our company'
  return (
    <LegalPage title="Privacy Policy" updated={PRIVACY_POLICY_UPDATED}>
      <p>
        This policy explains how {name} (&quot;we&quot;, &quot;us&quot;) collects, uses and protects your personal
        information when you visit this website, fill in one of our enquiry forms (including forms on Facebook and
        Instagram), or contact us by phone, WhatsApp, SMS or email.
      </p>

      <section>
        <h2>1. Information we collect</h2>
        <ul>
          <li><strong>Contact details:</strong> your name, phone number, email address and city.</li>
          <li><strong>Enquiry details:</strong> the project or property you are interested in, your answers to the questions on our forms, and any message you send us.</li>
          <li><strong>Lead form details from Meta:</strong> when you submit a lead form on Facebook or Instagram, Meta shares the information you entered in that form with us, along with the form and ad it came from.</li>
          <li><strong>Communication history:</strong> records of our calls, follow-ups and the messages we exchange with you.</li>
        </ul>
        <p className="mt-2">We do not ask for, and you should not send us, sensitive information such as bank, card or identity document numbers through our forms.</p>
      </section>

      <section>
        <h2>2. How we use your information</h2>
        <ul>
          <li>To respond to your enquiry and share the project details, prices and brochures you asked for.</li>
          <li>To arrange site visits and follow up with you about your enquiry.</li>
          <li>To send you messages about your enquiry by phone, WhatsApp, SMS or email.</li>
          <li>To keep internal records and improve our service.</li>
        </ul>
        <p className="mt-2">We do not sell your personal information, and we do not use it for any purpose unrelated to your enquiry.</p>
      </section>

      <section>
        <h2>3. Who we share it with</h2>
        <p>Your information is seen only by our team, and by the service providers we use to run our business, each under their own privacy terms:</p>
        <ul className="mt-2">
          <li>Website and database hosting (for example Vercel and Supabase).</li>
          <li>Messaging services we use to contact you (for example Meta for WhatsApp, an SMS provider, and an email provider).</li>
          <li>Meta, for the lead forms you submit on Facebook or Instagram.</li>
        </ul>
        <p className="mt-2">We may also disclose information when the law requires it.</p>
      </section>

      <section>
        <h2>4. How long we keep it</h2>
        <p>
          We keep your information for as long as it is needed to handle your enquiry and any purchase that follows,
          and to meet our legal obligations. After that, it is deleted. You can ask us to delete it earlier (see below).
        </p>
      </section>

      <section>
        <h2>5. How we protect it</h2>
        <p>
          Your information is stored on secure, access-controlled systems and sent over encrypted connections. Only
          authorised members of our team can see it, and each person sees only what their role needs.
        </p>
      </section>

      <section>
        <h2>6. Your rights</h2>
        <p>Under India&apos;s Digital Personal Data Protection Act, 2023, you can ask us to:</p>
        <ul className="mt-2">
          <li>tell you what information we hold about you;</li>
          <li>correct or update it;</li>
          <li>delete it; or</li>
          <li>stop contacting you.</li>
        </ul>
        <p className="mt-2">
          To make a request, contact us at <ContactLine />. We will respond within 30 days. For deletion, see{' '}
          <Link href="/data-deletion">how to delete your data</Link>.
        </p>
      </section>

      <section>
        <h2>7. Cookies</h2>
        <p>This website does not use advertising or tracking cookies.</p>
      </section>

      <section>
        <h2>8. Children</h2>
        <p>Our services are meant for adults. We do not knowingly collect information from anyone under 18.</p>
      </section>

      <section>
        <h2>9. Changes to this policy</h2>
        <p>If we change this policy, we will update the date at the top of this page.</p>
      </section>

      <section>
        <h2>10. Contact us</h2>
        <p>
          For any question about this policy or your information, contact {name} at <ContactLine />.
        </p>
      </section>
    </LegalPage>
  )
}
