import { COMPANY_NAME, META_GRAPH_BASE_URL } from '@/lib/site-config'
import { Resend } from 'resend'
import { getDayBoundsIst, getIstCurrentDateString } from '@/lib/timezone'

/**
 * Scheduled lead reports (email + WhatsApp). Server-only module: never import from client code.
 *
 * Every report covers:
 *  - the WINDOW: leads received since the recipient's previous report slot (e.g. 09:00 → 12:00 IST)
 *  - TODAY so far (IST) with a status breakdown
 *  - Follow ups: overdue and due today (live)
 * Numbers come from the same exact DB aggregation as /crm/reports (crm_leads_report).
 */

export const REPORT_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00']
export const DEFAULT_REPORT_TIMES = ['09:00', '18:00']

export interface LeadReportData {
  slotLabel: string        // "12:00 PM IST, 22 Nov 2026"
  windowLabel: string      // "9:00 AM – 12:00 PM IST"
  windowTotal: number
  todayTotal: number
  todayByStatus: { name: string; count: number }[]
  followUpOverdue: number
  followUpDueToday: number
  recentLeads: { name: string; phone: string; status: string; project: string; created_at: string }[]
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Current IST "HH:00" slot and its date, for an optional override hour. */
export function currentIstSlot(now = new Date()): { date: string; slot: string } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return { date: ist.toISOString().slice(0, 10), slot: `${String(ist.getUTCHours()).padStart(2, '0')}:00` }
}

/** UTC instant for an IST date + "HH:MM". */
export function istToUtc(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+05:30`)
}

const fmtTime = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })

/**
 * Window start for a recipient: their previous selected slot today, else their last slot yesterday
 * (so consecutive reports never overlap and never leave gaps).
 */
export function windowStartFor(times: string[], date: string, slot: string): Date {
  const sorted = [...new Set(times)].filter(t => REPORT_SLOTS.includes(t)).sort()
  const prevToday = sorted.filter(t => t < slot).pop()
  if (prevToday) return istToUtc(date, prevToday)
  const last = sorted[sorted.length - 1] || slot
  return new Date(istToUtc(date, last).getTime() - 24 * 60 * 60 * 1000)
}

export async function buildLeadReport(db: any, windowStart: Date, windowEnd: Date): Promise<LeadReportData> {
  const today = getIstCurrentDateString()
  const todayBounds = getDayBoundsIst(today)

  const [windowRes, todayRes, statusesRes, recentRes] = await Promise.all([
    db.rpc('crm_leads_report', { p_start: windowStart.toISOString(), p_end: windowEnd.toISOString(), p_source_keys: [] }),
    db.rpc('crm_leads_report', { p_start: todayBounds.startUtc, p_end: windowEnd.toISOString(), p_source_keys: [] }),
    db.from('lead_statuses').select('key, name, sort_order').order('sort_order', { ascending: true }),
    db.from('leads').select('name, phone, status, project, created_at')
      .gte('created_at', windowStart.toISOString()).lte('created_at', windowEnd.toISOString())
      .order('created_at', { ascending: false }).limit(10),
  ])
  if (windowRes.error) throw new Error(windowRes.error.message)
  if (todayRes.error) throw new Error(todayRes.error.message)

  const nameOf = new Map<string, string>((statusesRes.data || []).map((s: any) => [String(s.key).toLowerCase(), s.name]))
  const order = new Map<string, number>((statusesRes.data || []).map((s: any, i: number) => [String(s.key).toLowerCase(), i]))
  const todayByStatus = ((todayRes.data?.by_status || []) as { key: string; count: number }[])
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
    .map(s => ({ name: nameOf.get(s.key) || s.key, count: Number(s.count) }))

  const fu = todayRes.data?.follow_up || {}
  return {
    slotLabel: `${fmtTime(windowEnd)} IST, ${fmtDate(windowEnd)}`,
    windowLabel: `${fmtTime(windowStart)}${fmtDate(windowStart) !== fmtDate(windowEnd) ? ` (${fmtDate(windowStart)})` : ''} – ${fmtTime(windowEnd)} IST`,
    windowTotal: Number(windowRes.data?.total || 0),
    todayTotal: Number(todayRes.data?.total || 0),
    todayByStatus,
    followUpOverdue: Number(fu.overdue || 0),
    followUpDueToday: Number(fu.due_today || 0),
    recentLeads: (recentRes.data || []).map((l: any) => ({
      name: l.name || 'Unnamed', phone: l.phone || '-', status: nameOf.get(String(l.status || 'new').toLowerCase()) || l.status || 'New',
      project: l.project || '-', created_at: l.created_at,
    })),
  }
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function renderReportEmail(r: LeadReportData, companyName: string, isTest = false): { subject: string; html: string } {
  const statusRows = r.todayByStatus.map(s =>
    `<tr><td style="padding:8px 12px;font-size:13px;color:#0f1d33;border-top:1px solid #e8ecf2">${esc(s.name)}</td><td style="padding:8px 12px;font-size:13px;font-weight:bold;color:#0f1d33;text-align:right;border-top:1px solid #e8ecf2">${s.count}</td></tr>`).join('')
  const leadRows = r.recentLeads.map(l =>
    `<tr><td style="padding:8px;font-size:12px;color:#0f1d33;border-top:1px solid #e8ecf2">${esc(l.name)}</td><td style="padding:8px;font-size:12px;color:#5a6a82;border-top:1px solid #e8ecf2">${esc(l.phone)}</td><td style="padding:8px;font-size:12px;color:#5a6a82;border-top:1px solid #e8ecf2">${esc(l.project)}</td><td style="padding:8px;font-size:12px;color:#1e3a5f;font-weight:bold;border-top:1px solid #e8ecf2">${esc(l.status)}</td></tr>`).join('')
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e8ecf2;border-radius:12px;overflow:hidden">
  <div style="background:#0f1d33;padding:20px 24px">
    <h2 style="color:#fff;margin:0;font-size:18px">${esc(companyName)} · Leads Report${isTest ? ' (Test)' : ''}</h2>
    <p style="color:#c4a55a;margin:6px 0 0;font-size:13px;font-weight:bold">${esc(r.slotLabel)}</p>
  </div>
  <div style="padding:20px 24px">
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px">
      <tr><td style="padding:12px;font-size:13px;color:#5a6a82">New leads (${esc(r.windowLabel)})</td><td style="padding:12px;font-size:20px;font-weight:bold;color:#0f1d33;text-align:right">${r.windowTotal}</td></tr>
      <tr><td style="padding:12px;font-size:13px;color:#5a6a82;border-top:1px solid #e8ecf2">Total leads today</td><td style="padding:12px;font-size:16px;font-weight:bold;color:#0f1d33;text-align:right;border-top:1px solid #e8ecf2">${r.todayTotal}</td></tr>
      <tr><td style="padding:12px;font-size:13px;color:#b91c1c;border-top:1px solid #e8ecf2">Follow ups overdue</td><td style="padding:12px;font-size:16px;font-weight:bold;color:#b91c1c;text-align:right;border-top:1px solid #e8ecf2">${r.followUpOverdue}</td></tr>
      <tr><td style="padding:12px;font-size:13px;color:#c2410c;border-top:1px solid #e8ecf2">Follow ups due today</td><td style="padding:12px;font-size:16px;font-weight:bold;color:#c2410c;text-align:right;border-top:1px solid #e8ecf2">${r.followUpDueToday}</td></tr>
    </table>
    ${statusRows ? `<h3 style="font-size:14px;color:#0f1d33;margin:20px 0 6px">Today by status</h3><table style="width:100%;border-collapse:collapse">${statusRows}</table>` : ''}
    ${leadRows ? `<h3 style="font-size:14px;color:#0f1d33;margin:20px 0 6px">Latest leads in this window</h3><table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;font-size:11px;color:#5a6a82;padding:6px 8px">Name</th><th style="text-align:left;font-size:11px;color:#5a6a82;padding:6px 8px">Phone</th><th style="text-align:left;font-size:11px;color:#5a6a82;padding:6px 8px">Project</th><th style="text-align:left;font-size:11px;color:#5a6a82;padding:6px 8px">Status</th></tr>${leadRows}</table>` : '<p style="font-size:13px;color:#8a99ad;margin-top:16px">No new leads in this window.</p>'}
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e8ecf2;padding:12px 24px;font-size:11px;color:#8a99ad">Automated report from your CRM. Times are India Standard Time.</div>
</div>`
  return { subject: `${isTest ? '[Test] ' : ''}${companyName} Leads Report: ${r.windowTotal} new · ${r.slotLabel}`, html }
}

export async function sendReportEmail(to: string, r: LeadReportData, isTest = false): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.')
  if (!from || from.endsWith('@yourdomain.com')) throw new Error('RESEND_FROM_EMAIL is not configured with a verified sender domain.')
  const companyName = COMPANY_NAME
  const { subject, html } = renderReportEmail(r, companyName, isTest)
  const { error } = await new Resend(apiKey).emails.send({ from: `${companyName} Reports <${from}>`, to, subject, html })
  if (error) throw new Error(error.message || 'Resend rejected the email')
}

/**
 * WhatsApp Cloud API. Business-initiated messages MUST use an APPROVED template
 * (free-form text is only allowed within 24h of the recipient messaging you).
 * Template body must have exactly 6 variables, in this order:
 *  {{1}} report time · {{2}} window · {{3}} new in window · {{4}} today total · {{5}} follow ups overdue · {{6}} due today
 */
export async function sendReportWhatsApp(phone: string, r: LeadReportData): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const template = process.env.WHATSAPP_REPORT_TEMPLATE || 'crm_leads_report'
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en'
  if (!token || !phoneId) throw new Error('WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured.')

  const text = (v: string | number) => ({ type: 'text', text: String(v) })
  const res = await fetch(`${META_GRAPH_BASE_URL}/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template,
        language: { code: lang },
        components: [{ type: 'body', parameters: [text(r.slotLabel), text(r.windowLabel), text(r.windowTotal), text(r.todayTotal), text(r.followUpOverdue), text(r.followUpDueToday)] }],
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`)
}

/** WhatsApp verification code via an AUTHENTICATION template (copy-code button). */
export async function sendWhatsAppOtp(phone: string, code: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const template = process.env.WHATSAPP_OTP_TEMPLATE || 'crm_verification_code'
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en'
  if (!token || !phoneId) throw new Error('WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).')
  const res = await fetch(`${META_GRAPH_BASE_URL}/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template,
        language: { code: lang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`)
}
