import { COMPANY_NAME, META_GRAPH_BASE_URL, getConfiguredSiteUrl } from '@/lib/site-config'
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

export { REPORT_SLOTS, DEFAULT_REPORT_TIMES, currentIstSlot, istToUtc, windowForSlot, normalizeReportTimes } from './slots'

export interface LeadReportData {
  slotLabel: string        // "12:00 PM IST, 22 Nov 2026"
  windowLabel: string      // "9:00 AM – 12:00 PM IST"
  windowTotal: number
  todayTotal: number
  todayByStatus: { name: string; count: number }[]
  followUpOverdue: number
  followUpDueToday: number
  recentLeads: { name: string; phone: string; status: string; project: string; created_at: string }[]
  /** The window itself, for the download link */
  windowStartIso: string
  windowEndIso: string
}

const fmtTime = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })

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
    windowStartIso: windowStart.toISOString(),
    windowEndIso: windowEnd.toISOString(),
    recentLeads: (recentRes.data || []).map((l: any) => ({
      name: l.name || 'Unnamed', phone: l.phone || '-', status: nameOf.get(String(l.status || 'new').toLowerCase()) || l.status || 'New',
      project: l.project || '-', created_at: l.created_at,
    })),
  }
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** "9 PM Report (6 PM – 9 PM)" */
export function reportTitle(r: Pick<LeadReportData, 'windowStartIso' | 'windowEndIso'>): string {
  const hour = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: true }).toUpperCase()
  return `${hour(r.windowEndIso)} Report (${hour(r.windowStartIso)} – ${hour(r.windowEndIso)})`
}

/** The report email, in the plain style of the example: a short note, the total, and the Excel file(s) attached. */
export function renderReportEmail(r: LeadReportData, companyName: string, isTest = false, hasMaster = false): { subject: string; html: string; text: string } {
  const title = reportTitle(r)
  const masterLine = hasMaster ? 'A <b>master report</b> with every lead from the start till now is attached as well.' : ''
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:620px">
  <h1 style="margin:0 0 18px;font-size:26px;color:#111827">${esc(companyName)} Leads Report${isTest ? ' (Test)' : ''}</h1>
  <p style="margin:0 0 14px">Attached is the leads report for <b>${esc(title)}</b>.</p>
  ${masterLine ? `<p style="margin:0 0 14px">${masterLine}</p>` : ''}
  <p style="margin:0 0 26px">Total leads in this report: <b>${r.windowTotal}</b></p>
  <p style="margin:0;color:#6b7280">This is an automated system email.</p>
</div>`
  const text = `${companyName} Leads Report${isTest ? ' (Test)' : ''}\n\nAttached is the leads report for ${title}.${hasMaster ? '\nA master report with every lead from the start till now is attached as well.' : ''}\n\nTotal leads in this report: ${r.windowTotal}\n\nThis is an automated system email.`
  return { subject: `${isTest ? '[Test] ' : ''}[${companyName} CRM] ${title}`, html, text }
}

export interface ReportFile { filename: string; content: Buffer }

/** File names like leads_report_2026-11-27_09pm.xlsx */
export function reportFileNames(r: Pick<LeadReportData, 'windowEndIso'>): { report: string; master: string } {
  const end = new Date(r.windowEndIso)
  const day = end.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const hr = end.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: true }).replace(/\s/g, '').toLowerCase()
  return { report: `leads_report_${day}_${hr}.xlsx`, master: `master_leads_report_till_${day}_${hr}.xlsx` }
}

export async function sendReportEmail(to: string, r: LeadReportData, isTest = false, files: ReportFile[] = []): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.')
  if (!from || from.endsWith('@yourdomain.com')) throw new Error('RESEND_FROM_EMAIL is not configured with a verified sender domain.')
  const companyName = COMPANY_NAME
  const { subject, html, text } = renderReportEmail(r, companyName, isTest, files.length > 1)
  const { error } = await new Resend(apiKey).emails.send({
    from: `${companyName} Reports <${from}>`, to, subject, html, text,
    ...(files.length ? { attachments: files.map((f) => ({ filename: f.filename, content: f.content })) } : {}),
  })
  if (error) throw new Error(error.message || 'Resend rejected the email')
}

/**
 * The scheduled report on WhatsApp (staff recipients). A business-initiated message, so it MUST be an approved template.
 * Template `crm_leads_report_link` (category UTILITY, English). Body, with 6 variables in this order:
 *
 *   📊 *Automated {{1}} CRM Report*
 *
 *   *Report:* {{2}}
 *   *Generated:* {{3}}
 *   *Coverage Window:* {{4}}
 *
 *   Total Leads in Slot: {{5}} • Download Excel: {{6}}
 *
 *   This link works for 7 days.
 *
 * {{1}} company · {{2}} "9 PM Report (6 PM – 9 PM)" · {{3}} generated · {{4}} coverage window · {{5}} leads in the window
 * · {{6}} the signed Excel download link (see report-link.ts and /api/reports/download).
 */
export const REPORT_TEMPLATE_NAME = 'crm_leads_report_link'
/** Same message plus a 7th variable: the master report link. Body adds: "Master Report (all leads till date): {{7}}" before the last line. */
export const REPORT_MASTER_TEMPLATE_NAME = 'crm_leads_report_master'

const fmtStamp = (d: Date) => {
  const date = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()
  return { date, time }
}
const hourLabel = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: true }).toUpperCase()

/** The six values for the template (single line each: WhatsApp does not allow line breaks inside a variable). */
export function reportTemplateValues(r: LeadReportData, link: string, now = new Date()): string[] {
  const start = new Date(r.windowStartIso), end = new Date(r.windowEndIso)
  const gen = fmtStamp(now), from = fmtStamp(start), to = fmtStamp(end)
  return [
    COMPANY_NAME,
    reportTitle(r),
    `${gen.date} at ${gen.time}`,
    `${from.date}, ${from.time} – ${to.date}, ${to.time}`,
    String(r.windowTotal),
    link,
  ]
}

export async function sendReportWhatsApp(phone: string, r: LeadReportData, withMaster = false): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const template = withMaster
    ? (process.env.WHATSAPP_REPORT_MASTER_TEMPLATE || REPORT_MASTER_TEMPLATE_NAME)
    : (process.env.WHATSAPP_REPORT_TEMPLATE || REPORT_TEMPLATE_NAME)
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en'
  if (!token || !phoneId) throw new Error('WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured.')

  const { signReportToken, signMasterToken } = await import('./report-link')
  const base = (getConfiguredSiteUrl() || 'https://meesampadha.com').replace(/\/+$/, '')
  const link = `${base}/api/reports/download?token=${signReportToken(new Date(r.windowStartIso), new Date(r.windowEndIso))}`
  const masterLink = `${base}/api/reports/download?token=${signMasterToken(new Date(r.windowEndIso))}`

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
        components: [{ type: 'body', parameters: [...reportTemplateValues(r, link), ...(withMaster ? [masterLink] : [])].map((t) => ({ type: 'text', text: t })) }],
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
