import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyReportToken } from '@/lib/reports/report-link'
import { buildReportWorkbook } from '@/lib/reports/report-excel'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The "Download Excel" link in the scheduled WhatsApp report. Needs a valid signed token (see report-link.ts):
 * it opens only the report window the link was made for, and stops working after 7 days.
 */
export async function GET(request: Request) {
  const win = verifyReportToken(new URL(request.url).searchParams.get('token'))
  if (!win) return new NextResponse('This report link is invalid or has expired.', { status: 403 })
  try {
    const buffer = await buildReportWorkbook(createServiceClient(), win.start, win.end)
    const day = win.end.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leads-report-${day}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[report download]', e instanceof Error ? e.message : e)
    return new NextResponse('Could not build the report right now. Please try again.', { status: 500 })
  }
}
