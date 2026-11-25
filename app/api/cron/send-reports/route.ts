import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeWaReportTimings } from '@/lib/phone-input'
import {
  REPORT_SLOTS, DEFAULT_REPORT_TIMES, currentIstSlot, istToUtc, windowStartFor,
  buildLeadReport, sendReportEmail, sendReportWhatsApp, type LeadReportData,
} from '@/lib/reports/lead-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduled lead reports. Call EVERY HOUR at minute 0 (IST) from an external cron (cron-job.org):
 *   GET /api/cron/send-reports   with header   Authorization: Bearer <CRON_SECRET>
 * Sends to every email/WhatsApp recipient whose selected times include the current IST hour.
 * Idempotent: report_dispatch_log has UNIQUE(channel, recipient, slot), so retries never double-send.
 */

/** cron-job.org stores response bodies: never echo full emails/phones */
const mask = (v: string) => v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1***$2') : v.replace(/\d(?=\d{3})/g, '*')

export async function GET(request: Request) {
  const cronAuth = checkCronAuth(request)
  if (!cronAuth.ok) return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status })

  const { date, slot } = currentIstSlot()
  if (!REPORT_SLOTS.includes(slot)) {
    return NextResponse.json({ status: 'skipped', reason: `No report slot at ${slot} IST`, slot })
  }

  const db = createServiceClient()
  const slotEnd = istToUtc(date, slot)
  const slotKey = `${date}T${slot}`

  const [{ data: emails }, { data: phones }] = await Promise.all([
    db.from('report_recipients').select('id, email, report_times'),
    db.from('whatsapp_report_recipients').select('id, phone, report_times'),
  ])

  const jobs: { channel: 'email' | 'whatsapp'; id: string; to: string; times: string[] }[] = [
    ...(emails || []).map((r: any) => ({ channel: 'email' as const, id: r.id, to: r.email, times: r.report_times?.length ? r.report_times : DEFAULT_REPORT_TIMES })),
    ...(phones || []).map((r: any) => ({ channel: 'whatsapp' as const, id: r.id, to: r.phone, times: normalizeWaReportTimings(r.report_times) })),
  ].filter(j => j.times.includes(slot))

  const reportCache = new Map<number, LeadReportData>() // one build per distinct window
  const results: { channel: string; to: string; status: string; error?: string }[] = []

  for (const job of jobs) {
    // Claim this (channel, recipient, slot). If the row already exists, it was sent (or is being sent).
    const { data: claimed, error: claimErr } = await db.from('report_dispatch_log')
      .insert({ channel: job.channel, recipient_id: job.id, slot_key: slotKey, status: 'pending' })
      .select('id').maybeSingle()
    if (claimErr || !claimed) { results.push({ channel: job.channel, to: mask(job.to), status: 'already_sent' }); continue }

    try {
      const start = windowStartFor(job.times, date, slot)
      let report = reportCache.get(start.getTime())
      if (!report) { report = await buildLeadReport(db, start, slotEnd); reportCache.set(start.getTime(), report) }

      if (job.channel === 'email') await sendReportEmail(job.to, report)
      else await sendReportWhatsApp(job.to, report)

      await db.from('report_dispatch_log').update({ status: 'sent' }).eq('id', claimed.id)
      results.push({ channel: job.channel, to: mask(job.to), status: 'sent' })
    } catch (err: any) {
      // Remove the claim so the next run / a manual retry can try again
      await db.from('report_dispatch_log').delete().eq('id', claimed.id)
      results.push({ channel: job.channel, to: mask(job.to), status: 'failed', error: err.message })
    }
  }

  return NextResponse.json({ status: 'completed', slot: `${slot} IST`, date, recipients: jobs.length, results })
}
