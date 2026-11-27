import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { COMPANY_NAME } from '@/lib/site-config'
import { emailConfigured, sendEmails } from '@/lib/email'
import { isValidEmail } from '@/lib/outreach'
import { DEFAULT_WELCOME_EMAIL, WELCOME_EMAIL_KEY, normalizeWelcomeConfig, renderWelcomeEmail, type WelcomeEmailConfig } from '@/lib/welcome-email'

/** Server only. Loads the saved welcome template and sends it to a brand-new lead (customer only, never to staff). */

export async function loadWelcomeConfig(): Promise<WelcomeEmailConfig> {
  const { data } = await createServiceClient().from('crm_settings').select('value').eq('key', WELCOME_EMAIL_KEY).maybeSingle()
  if (!data?.value) return { ...DEFAULT_WELCOME_EMAIL }
  try { return normalizeWelcomeConfig(JSON.parse(data.value)) } catch { return { ...DEFAULT_WELCOME_EMAIL } }
}

/** Sends the welcome email to one new lead if it is switched on and the lead has an email. Never throws. */
export async function sendWelcomeEmailToLead(leadId: string): Promise<void> {
  try {
    const cfg = await loadWelcomeConfig()
    if (!cfg.enabled || !emailConfigured()) return
    const db = createServiceClient()
    const { data: lead } = await db.from('leads').select('id, name, email, project').eq('id', leadId).maybeSingle()
    if (!lead || !isValidEmail(lead.email)) return

    // Never twice to the same lead (e.g. a webhook delivered twice)
    const { data: already } = await db.from('lead_activities').select('id').eq('lead_id', leadId)
      .eq('activity_type', 'email_sent').like('description', 'Welcome email sent automatically%').limit(1)
    if (already && already.length > 0) return

    const mail = renderWelcomeEmail(cfg, lead, COMPANY_NAME)
    const [result] = await sendEmails([{ to: String(lead.email).trim(), subject: mail.subject, html: mail.html, text: mail.text }])
    await db.from('lead_activities').insert({
      lead_id: lead.id,
      activity_type: result?.ok ? 'email_sent' : 'email_failed',
      description: result?.ok
        ? `Welcome email sent automatically: ${mail.subject}`
        : `Welcome email not sent (${result?.error || 'unknown error'}): ${mail.subject}`,
      metadata: { _subject: mail.subject, _text: mail.text, _to: lead.email, _error: result?.error || null, _by_name: 'Automatic welcome email' },
    })
  } catch (e) {
    console.error('Welcome email failed:', e)
  }
}

/** Runs the welcome email after the response is sent, so saving a lead is never slowed down by it. */
export function queueWelcomeEmail(leadId: string | null | undefined): void {
  if (!leadId) return
  try {
    after(() => sendWelcomeEmailToLead(leadId))
  } catch {
    void sendWelcomeEmailToLead(leadId)
  }
}
