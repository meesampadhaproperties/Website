import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { masterTimesFor, normalizeReportTimes } from '@/lib/reports/slots'
import {
  REPORT_SLOTS, DEFAULT_REPORT_TIMES, currentIstSlot, windowForSlot,
  buildLeadReport, sendReportEmail, sendReportWhatsApp, reportFileNames, type LeadReportData, type ReportFile,
} from '@/lib/reports/lead-report'
import { buildReportWorkbook } from '@/lib/reports/report-excel'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduled lead reports, at six fixed times (IST): 6 AM, 9 AM, 12 PM, 3 PM, 6 PM, 9 PM.
 * Each report covers the time since the previous slot (6 AM covers yesterday 9 PM to 6 AM).
 * A recipient can also get the MASTER report (every lead from the start) at the slots they tick.
 *
 * Call from an external cron (cron-job.org) at those six times, or every hour (other hours do nothing):
 *   GET /api/cron/send-reports   with header   Authorization: Bearer <CRON_SECRET>
 * Idempotent: report_dispatch_log has UNIQUE(channel, recipient, slot), so retries never double-send.
 */

/** cron-job.org stores response bodies: never echo full emails/phones */
const mask = (v: string) => v.includes('@') ? v.replace(/^(.).*(@.*)$/, '$1***$2') : v.replace(/\d(?=\d{3})/g, '*')

export async function GET(request: Request) {
  const cronAuth = checkCronAuth(request)
  if (!cronAuth.ok) return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status })

  const { date, slot } = currentIstSlot()
  if (!(REPORT_SLOTS as readonly string[]).includes(slot)) {
    return NextResponse.json({ status: 'skipped', reason: `No report slot at ${slot} IST`, slot })
  }

  const db = createServiceClient()
  const { start, end } = windowForSlot(date, slot)
  const slotKey = `${date}T${slot}`

  const [{ data: emails }, { data: phones }] = await Promise.all([
    db.from('report_recipients').select('id, email, report_times, master_times'),
    db.from('whatsapp_report_recipients').select('id, phone, report_times, master_times'),
  ])

  const timesOf = (raw: unknown) => { const t = normalizeReportTimes(raw); return t.length ? t : DEFAULT_REPORT_TIMES }
  const jobs = [
    ...(emails || []).map((r: any) => ({ channel: 'email' as const, id: r.id as string, to: r.email as string, times: timesOf(r.report_times), master: masterTimesFor(timesOf(r.report_times), r.master_times) })),
    ...(phones || []).map((r: any) => ({ channel: 'whatsapp' as const, id: r.id as string, to: r.phone as string, times: timesOf(r.report_times), master: masterTimesFor(timesOf(r.report_times), r.master_times) })),
  ].filter(j => j.times.includes(slot))

  // Built once for everybody: the report numbers and the Excel files
  let report: LeadReportData | null = null
  let reportFile: ReportFile | null = null
  let masterFile: ReportFile | null = null
  const results: { channel: string; to: string; status: string; error?: string }[] = []

  for (const job of jobs) {
    // Claim this (channel, recipient, slot). If the row already exists, it was sent (or is being sent).
    const { data: claimed, error: claimErr } = await db.from('report_dispatch_log')
      .insert({ channel: job.channel, recipient_id: job.id, slot_key: slotKey, status: 'pending' })
      .select('id').maybeSingle()
    if (claimErr || !claimed) { results.push({ channel: job.channel, to: mask(job.to), status: 'already_sent' }); continue }

    try {
      if (!report) report = await buildLeadReport(db, start, end)
      const withMaster = job.master.includes(slot)

      if (job.channel === 'email') {
        const names = reportFileNames(report)
        if (!reportFile) reportFile = { filename: names.report, content: await buildReportWorkbook(db, start, end) }
        // The master report (every lead so far) can be large: only built when someone ticked it for this slot
        if (withMaster && !masterFile) masterFile = { filename: names.master, content: await buildReportWorkbook(db, start, end, true) }
        await sendReportEmail(job.to, report, false, withMaster && masterFile ? [reportFile, masterFile] : [reportFile])
      } else {
        await sendReportWhatsApp(job.to, report, withMaster)
      }

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
