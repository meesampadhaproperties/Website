'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { emailConfigured, sendEmails } from '@/lib/email'
import { OUTREACH_MAX_LEADS, isValidEmail, personalize, textToEmailHtml } from '@/lib/outreach'
import { phoneMatchKey } from '@/lib/lead-phone'
import { splitByWindow, windowStart } from '@/lib/whatsapp-window'
import { sendWhatsAppText, whatsappCredentialsConfigured } from '@/lib/whatsapp-bot'
import { SMS_ENABLED, SMS_DISABLED_MESSAGE, SMS_VALUE_MAX, fillTemplate, msg91Mobile, sendMsg91Sms, templateVariables } from '@/lib/sms'

/**
 * Messaging leads (REQ-103), used by the Bulk Sender page and the Inbox.
 * Allowed with 'edit' on Bulk Sender or on Inbox. Every attempt is saved in the lead's history.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function messagingAccess(level: 'view' | 'edit') {
  const bulk = await checkActionAccess('bulk_sender', level)
  return bulk.authorized ? bulk : checkActionAccess('inbox', level)
}

async function actorName(db: ReturnType<typeof createServiceClient>, user: any): Promise<string> {
  const { data } = await db.from('profiles').select('name, email').eq('id', user?.id).maybeSingle()
  return String(data?.name || '').trim() || data?.email || user?.email || 'Unknown user'
}

function cleanIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null
  const list = [...new Set(ids.map(String).filter((id) => UUID_RE.test(id)))]
  return list.length > 0 && list.length <= OUTREACH_MAX_LEADS ? list : null
}

export interface SendSummary {
  sent: number
  failed: number
  /** No email address / no valid mobile */
  skipped: number
  errors: string[]
}

/** What's set up on this deployment, for the composer. */
export async function getMessagingSetup(): Promise<{ email: boolean; smsKey: boolean; waBot: boolean; smsTemplates: { id: string; name: string; body: string }[]; error?: string }> {
  const auth = await messagingAccess('view')
  if (!auth.authorized) return { email: false, smsKey: false, waBot: false, smsTemplates: [], error: auth.error }
  const { data } = await createServiceClient().from('sms_templates').select('id, name, body').eq('is_active', true).order('name', { ascending: true })
  return { email: emailConfigured(), smsKey: !!process.env.MSG91_AUTH_KEY, waBot: whatsappCredentialsConfigured(), smsTemplates: data || [] }
}

/** Custom email to one or many leads. {name}/{project} are filled per lead. */
export async function sendEmailToLeads(leadIds: string[], subject: string, body: string): Promise<SendSummary | { error: string }> {
  const auth = await messagingAccess('edit')
  if (!auth.authorized) return { error: auth.error }
  const ids = cleanIds(leadIds)
  if (!ids) return { error: `Choose between 1 and ${OUTREACH_MAX_LEADS} leads.` }
  const subj = String(subject || '').trim()
  const text = String(body || '').trim()
  if (!subj || subj.length > 200) return { error: 'Please write a subject (up to 200 characters).' }
  if (!text || text.length > 10_000) return { error: 'Please write a message (up to 10,000 characters).' }
  if (!emailConfigured()) return { error: 'Email is not set up yet (RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel).' }

  const db = createServiceClient()
  const { data: leads } = await db.from('leads').select('id, name, email, project').in('id', ids)
  const withEmail = (leads || []).filter((l: any) => isValidEmail(l.email))
  const messages = withEmail.map((l: any) => {
    const t = personalize(text, l)
    return { to: String(l.email).trim(), subject: personalize(subj, l), text: t, html: textToEmailHtml(t) }
  })
  const results = await sendEmails(messages)
  const by = await actorName(db, auth.user)
  const at = new Date().toISOString()
  await db.from('lead_activities').insert(withEmail.map((l: any, i: number) => ({
    lead_id: l.id,
    activity_type: results[i]?.ok ? 'email_sent' : 'email_failed',
    description: results[i]?.ok
      ? `Email sent by ${by}: ${messages[i].subject}\n${messages[i].text}`
      : `Email not sent by ${by} (${results[i]?.error || 'unknown error'}): ${messages[i].subject}`,
    metadata: { _subject: messages[i].subject, _text: messages[i].text, _to: messages[i].to, _error: results[i]?.error || null, _by_id: auth.user?.id || null, _by_name: by },
    created_at: at,
  })))
  revalidatePath('/crm/inbox')

  const failed = results.filter((r) => !r.ok)
  return {
    sent: results.length - failed.length,
    failed: failed.length,
    skipped: ids.length - withEmail.length,
    errors: [...new Set(failed.map((r) => r.error || 'Unknown error'))],
  }
}

/** Approved MSG91 template to one or many leads. Blank values may use {name}/{project}, filled per lead. */
export async function sendSmsToLeads(leadIds: string[], templateId: string, values: Record<string, string>): Promise<SendSummary | { error: string }> {
  const auth = await messagingAccess('edit')
  if (!auth.authorized) return { error: auth.error }
  if (!SMS_ENABLED) return { error: SMS_DISABLED_MESSAGE }
  const ids = cleanIds(leadIds)
  if (!ids) return { error: `Choose between 1 and ${OUTREACH_MAX_LEADS} leads.` }
  if (!UUID_RE.test(String(templateId || ''))) return { error: 'Choose an SMS template.' }
  const authKey = process.env.MSG91_AUTH_KEY
  if (!authKey) return { error: 'SMS is not set up yet (MSG91_AUTH_KEY in Vercel).' }

  const db = createServiceClient()
  const [{ data: template }, { data: leads }] = await Promise.all([
    db.from('sms_templates').select('id, name, msg91_template_id, body, is_active').eq('id', templateId).maybeSingle(),
    db.from('leads').select('id, name, phone, project').in('id', ids),
  ])
  if (!template || !template.is_active) return { error: 'This SMS template is not available.' }
  const blanks = templateVariables(template.body)
  for (const b of blanks) if (!String(values?.[b] ?? '').trim()) return { error: `Please fill in "${b}".` }

  // Per lead: fill {name}/{project}, check DLT's 30-character limit, MSG91 mobile format
  const ready: { lead: any; mobile: string; values: Record<string, string>; text: string }[] = []
  const failedLeads: { lead: any; error: string }[] = []
  let skipped = 0
  for (const l of leads || []) {
    const mobile = msg91Mobile(l.phone)
    if (!mobile) { skipped++; continue }
    const v: Record<string, string> = {}
    let problem = ''
    for (const b of blanks) {
      v[b] = personalize(String(values[b]), l).replace(/\s+/g, ' ').trim()
      if (v[b].length > SMS_VALUE_MAX) problem = `"${b}" is longer than ${SMS_VALUE_MAX} characters for this lead`
    }
    if (problem) failedLeads.push({ lead: l, error: problem })
    else ready.push({ lead: l, mobile, values: v, text: fillTemplate(template.body, v) })
  }
  skipped += ids.length - (leads || []).length

  // MSG91 takes many recipients per call
  const outcome = new Map<string, { ok: boolean; error?: string; requestId?: string | null }>()
  for (let i = 0; i < ready.length; i += 100) {
    const chunk = ready.slice(i, i + 100)
    const res = await sendMsg91Sms({ authKey, templateId: template.msg91_template_id, recipients: chunk.map((r) => ({ mobile: r.mobile, values: r.values })) })
    chunk.forEach((r) => outcome.set(r.lead.id, 'error' in res ? { ok: false, error: res.error } : { ok: true, requestId: res.requestId }))
  }

  const by = await actorName(db, auth.user)
  const at = new Date().toISOString()
  const rows = [
    ...ready.map((r) => {
      const o = outcome.get(r.lead.id)!
      return {
        lead_id: r.lead.id,
        activity_type: o.ok ? 'sms_sent' : 'sms_failed',
        description: o.ok ? `SMS sent by ${by} (${template.name}): ${r.text}` : `SMS not sent by ${by} (${template.name}): ${o.error}`,
        metadata: { _template_id: template.id, _template_name: template.name, _text: r.text, _request_id: o.requestId || null, _error: o.error || null, _by_id: auth.user?.id || null, _by_name: by },
        created_at: at,
      }
    }),
    ...failedLeads.map((f) => ({
      lead_id: f.lead.id,
      activity_type: 'sms_failed',
      description: `SMS not sent by ${by} (${template.name}): ${f.error}`,
      metadata: { _template_id: template.id, _template_name: template.name, _error: f.error, _by_id: auth.user?.id || null, _by_name: by },
      created_at: at,
    })),
  ]
  if (rows.length) await db.from('lead_activities').insert(rows)
  revalidatePath('/crm/inbox')

  const sendFailures = [...outcome.values()].filter((o) => !o.ok)
  return {
    sent: [...outcome.values()].filter((o) => o.ok).length,
    failed: sendFailures.length + failedLeads.length,
    skipped,
    errors: [...new Set([...sendFailures.map((o) => `MSG91: ${o.error}`), ...failedLeads.map((f) => f.error)])],
  }
}

/** Records a message staff opened in their own WhatsApp / SMS app (custom text, sent by them). */
export async function logOutreach(leadId: string, channel: 'whatsapp' | 'sms_phone', text: string): Promise<{ success: boolean; error?: string }> {
  const auth = await messagingAccess('edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(leadId || ''))) return { success: false, error: 'Invalid lead.' }
  const db = createServiceClient()
  const by = await actorName(db, auth.user)
  const body = String(text || '').slice(0, 4000)
  const { error } = await db.from('lead_activities').insert({
    lead_id: leadId,
    activity_type: channel === 'whatsapp' ? 'whatsapp_opened' : 'sms_opened',
    description: `${channel === 'whatsapp' ? 'WhatsApp chat opened' : 'SMS opened on phone'} by ${by}: ${body}`,
    metadata: { _text: body, _by_id: auth.user?.id || null, _by_name: by },
    created_at: new Date().toISOString(),
  })
  return error ? { success: false, error: error.message } : { success: true }
}


// ---------------------------------------------------------------- WhatsApp through the bot number (free inside the 24-hour window)

export interface BotSendSummary extends SendSummary {
  /** Not messaged: they have not written to the bot in the last 24 hours (it would cost money, so it is not sent) */
  outside: number
}

/** Phone keys of everyone who messaged the bot number in the last 24 hours. */
async function activePhoneKeys(db: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
  const { data: acts } = await db.from('lead_activities').select('lead_id')
    .in('activity_type', ['whatsapp_in', 'whatsapp_message']).gte('created_at', windowStart().toISOString()).limit(5000)
  const leadIds = [...new Set(((acts || []) as any[]).map((a) => a.lead_id))]
  if (leadIds.length === 0) return new Set()
  const { data: people } = await db.from('leads').select('phone').in('id', leadIds)
  return new Set(((people || []) as any[]).map((p) => phoneMatchKey(p.phone)).filter(Boolean))
}

/** For the composer: how many of these leads can be messaged for free right now. */
export async function getWhatsAppBotWindow(leadIds: string[]): Promise<{ configured: boolean; inWindow: number; outside: number; noPhone: number; error?: string }> {
  const auth = await messagingAccess('view')
  if (!auth.authorized) return { configured: false, inWindow: 0, outside: 0, noPhone: 0, error: auth.error }
  const ids = cleanIds(leadIds)
  if (!ids) return { configured: whatsappCredentialsConfigured(), inWindow: 0, outside: 0, noPhone: 0 }
  const db = createServiceClient()
  const { data: leads } = await db.from('leads').select('id, phone').in('id', ids)
  const { inWindow, outside, noPhone } = splitByWindow((leads || []) as any[], await activePhoneKeys(db))
  return { configured: whatsappCredentialsConfigured(), inWindow: inWindow.length, outside: outside.length, noPhone: noPhone.length }
}

/**
 * Sends a custom WhatsApp message from the bot number, automatically, to the leads who messaged it in the last 24 hours.
 * That is free. Everyone else is skipped, never sent (it would need a paid template). {name}/{project} are filled per lead.
 */
export async function sendWhatsAppViaBot(leadIds: string[], body: string): Promise<BotSendSummary | { error: string }> {
  const auth = await messagingAccess('edit')
  if (!auth.authorized) return { error: auth.error }
  const ids = cleanIds(leadIds)
  if (!ids) return { error: `Choose between 1 and ${OUTREACH_MAX_LEADS} leads.` }
  const text = String(body || '').trim()
  if (!text || text.length > 2000) return { error: 'Please write a message (up to 2,000 characters).' }
  if (!whatsappCredentialsConfigured()) return { error: 'The WhatsApp bot is not set up yet (WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel).' }

  const db = createServiceClient()
  const { data: leads } = await db.from('leads').select('id, name, phone, project').in('id', ids)
  const { inWindow, outside, noPhone } = splitByWindow((leads || []) as any[], await activePhoneKeys(db))

  const by = await actorName(db, auth.user)
  const results: { lead: any; message: string; ok: boolean; error?: string }[] = []
  // A few at a time: fast, and kind to WhatsApp's rate limits
  for (let i = 0; i < inWindow.length; i += 5) {
    const batch = inWindow.slice(i, i + 5)
    results.push(...await Promise.all(batch.map(async (lead) => {
      const message = personalize(text, lead)
      const r = await sendWhatsAppText(phoneMatchKey(lead.phone).slice(1), message)
      return { lead, message, ok: r.ok, error: r.error }
    })))
  }

  const at = new Date().toISOString()
  if (results.length) {
    await db.from('lead_activities').insert(results.map((r) => r.ok
      ? { lead_id: r.lead.id, activity_type: 'whatsapp_out', description: r.message, metadata: { bulk: true, _by_id: auth.user?.id || null, _by_name: by }, created_at: at }
      : { lead_id: r.lead.id, activity_type: 'whatsapp_failed', description: `WhatsApp not sent by ${by} (${r.error || 'unknown error'}): ${r.message}`, metadata: { bulk: true, _error: r.error || null, _by_name: by }, created_at: at }))
  }
  revalidatePath('/crm/inbox')

  const failed = results.filter((r) => !r.ok)
  return {
    sent: results.length - failed.length,
    failed: failed.length,
    skipped: noPhone.length,
    outside: outside.length,
    errors: [...new Set(failed.map((r) => r.error || 'Unknown error'))],
  }
}
