import { Resend } from 'resend'
import { COMPANY_NAME, CONTACT_EMAIL } from './site-config'

/** Custom emails to leads (REQ-103) through Resend. Server-only. */

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL
}

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Sends emails in batches of 100 (Resend's batch limit). Returns one result per email, in order.
 * A failed batch marks all of its emails as failed with Resend's reason.
 */
export async function sendEmails(emails: OutgoingEmail[]): Promise<{ ok: boolean; error?: string; id?: string }[]> {
  if (!emailConfigured()) return emails.map(() => ({ ok: false, error: 'Email is not set up (RESEND_API_KEY / RESEND_FROM_EMAIL).' }))
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = `${COMPANY_NAME} <${process.env.RESEND_FROM_EMAIL}>`
  const results: { ok: boolean; error?: string; id?: string }[] = []
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100)
    try {
      const { data, error } = await resend.batch.send(chunk.map((e) => ({
        from, to: e.to, subject: e.subject, html: e.html, text: e.text,
        ...(CONTACT_EMAIL ? { replyTo: CONTACT_EMAIL } : {}),
      })))
      if (error) chunk.forEach(() => results.push({ ok: false, error: error.message || 'Resend rejected the emails' }))
      else chunk.forEach((_, j) => results.push({ ok: true, id: (data as any)?.data?.[j]?.id }))
    } catch (e: any) {
      chunk.forEach(() => results.push({ ok: false, error: e?.message || 'Could not reach Resend' }))
    }
  }
  return results
}
