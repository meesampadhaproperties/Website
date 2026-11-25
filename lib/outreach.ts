import { phoneMatchKey } from './lead-phone'

/**
 * Messaging leads (REQ-103): Bulk Sender and Inbox.
 * - Email: fully custom, sent automatically.
 * - SMS: automatic only with MSG91 DLT-approved templates; custom text opens the phone's SMS app.
 * - WhatsApp: custom text opens a WhatsApp chat with the message typed in (staff press Send).
 * Shared by client and server.
 */

export interface OutreachLead {
  id: string
  name?: string | null
  phone?: string | null
  email?: string | null
  project?: string | null
}

/** {name} → first name, {full_name}, {project}. Unknown tokens are left as typed. */
export function personalize(text: string, lead: Pick<OutreachLead, 'name' | 'project'>): string {
  const full = String(lead.name || '').trim()
  const first = full.split(/\s+/)[0] || ''
  return String(text || '')
    .replace(/\{full_name\}/gi, full || 'there')
    .replace(/\{name\}/gi, first || 'there')
    .replace(/\{project\}/gi, String(lead.project || '').trim() || 'our project')
}

export const PERSONALIZE_HINT = 'Use {name} for the first name and {project} for their project.'

/** wa.me link that opens a chat with the text typed in, or null without a valid number. */
export function whatsappChatUrl(phone: string | null | undefined, text: string): string | null {
  const key = phoneMatchKey(phone)
  return key ? `https://wa.me/${key.slice(1)}?text=${encodeURIComponent(text)}` : null
}

/** sms: link that opens the phone's SMS app with the text typed in (works on Android and iPhone). */
export function smsAppUrl(phone: string | null | undefined, text: string): string | null {
  const key = phoneMatchKey(phone)
  return key ? `sms:${key}?&body=${encodeURIComponent(text)}` : null
}

export const isValidEmail = (email: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())

/** Escapes text and turns line breaks into a simple HTML email body. */
export function textToEmailHtml(text: string): string {
  const esc = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paras = esc.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${paras}</div>`
}

/** Max leads per send (keeps each request within the server time limit). */
export const OUTREACH_MAX_LEADS = 200
