'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { CalendarClock, Database, RefreshCw, AlertTriangle } from 'lucide-react'
import { getLeadsReport, type LeadsReport, type ReportRange } from './actions'

// ---------- Chart tokens (validated reference palette; single-series charts use slot 1) ----------
const SERIES_1 = '#2a78d6'
const GRID = '#eef1f5'
const AXIS_TEXT = '#5a6a82'
const TEXT_PRIMARY = '#0f1d33'

/** Status bars wear the status's own badge hue (color follows the entity), at Tailwind's 600 step. */
const TAILWIND_600: Record<string, string> = {
  slate: '#475569', gray: '#4b5563', zinc: '#52525b', neutral: '#525252', stone: '#57534e',
  red: '#dc2626', orange: '#ea580c', amber: '#d97706', yellow: '#ca8a04', lime: '#65a30d',
  green: '#16a34a', emerald: '#059669', teal: '#0d9488', cyan: '#0891b2', sky: '#0284c7',
  blue: '#2563eb', indigo: '#4f46e5', violet: '#7c3aed', purple: '#9333ea', fuchsia: '#c026d3',
  pink: '#db2777', rose: '#e11d48',
}
const hueFromClass = (cls?: string) => {
  const m = (cls || '').match(/(?:text|bg|border)-([a-z]+)-\d{2,3}/)
  return (m && TAILWIND_600[m[1]]) || SERIES_1
}

const RANGES: { value: ReportRange; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
]

const nf = new Intl.NumberFormat('en-IN')
const pct = (n: number, total: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%')
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Fills missing IST days with zero (so gaps are real zeros, not interpolated) and buckets by month for long spans. */
function buildTrend(r: LeadsReport) {
  if (r.daily.length === 0) return { points: [] as { label: string; full: string; count: number }[], unit: 'day' as const }
  const counts = new Map(r.daily.map(d => [d.day, d.count]))
  const start = r.startDate || r.daily[0].day
  const end = r.endDate
  const days: string[] = []
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...opts })

  if (days.length <= 92) {
    return {
      unit: 'day' as const,
      points: days.map(day => ({ label: fmtDay(day, { day: '2-digit', month: 'short' }), full: fmtDay(day, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }), count: counts.get(day) || 0 })),
    }
  }
  const months = new Map<string, number>()
  days.forEach(day => months.set(day.slice(0, 7), (months.get(day.slice(0, 7)) || 0) + (counts.get(day) || 0)))
  return {
    unit: 'month' as const,
    points: Array.from(months.entries()).map(([m, count]) => ({
      label: fmtDay(`${m}-01`, { month: 'short', year: '2-digit' }), full: fmtDay(`${m}-01`, { month: 'long', year: 'numeric' }), count,
    })),
  }
}

function ChartTooltip({ active, payload, title }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-[#e8ecf2] bg-white px-3 py-2 shadow-md text-xs">
      <div className="font-semibold text-[#0f1d33]">{title ? title(p.payload) : p.payload.name}</div>
      <div className="mt-0.5 text-[#5a6a82]">
        <span className="font-bold text-[#0f1d33]">{nf.format(p.value)}</span> {p.value === 1 ? 'lead' : 'leads'}
        {p.payload.share ? <> · {p.payload.share}</> : null}
      </div>
    </div>
  )
}

/** Card with a chart ↔ table toggle (table view = accessible, exact numbers). */
function ChartCard({ title, subtitle, rows, children, className = '' }: {
  title: string; subtitle?: string; rows: { label: string; value: number; share?: string }[]; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`min-w-0 self-start rounded-xl border border-[#e8ecf2] bg-white p-3 sm:p-4 md:p-5 shadow-xs ${className}`}>
      <div className="mb-3 min-w-0">
        <h2 className="truncate text-sm sm:text-base font-bold text-[#0f1d33]">{title}</h2>
        {subtitle && <p className="truncate text-[11px] sm:text-xs text-[#5a6a82]">{subtitle}</p>}
      </div>
      {rows.length === 0 || rows.every(r => r.value === 0) ? (
        <div className="flex h-48 items-center justify-center rounded-lg bg-[#f8fafc] text-xs text-[#8a99ad]">No leads in this period.</div>
      ) : children}
    </section>
  )
}

/** Trend chart: scrolls sideways when there are many days (opens at the latest day). */
function ScrollableTrend({ points, children }: { points: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth }, [points])
  return (
    <div ref={ref} className="w-full overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
      <div className="h-[220px] sm:h-[280px]" style={{ minWidth: `max(100%, ${points * 34}px)` }}>{children}</div>
    </div>
  )
}

/** Horizontal bars: long category names stay readable on mobile (no rotated labels). */
function HBarChart({ data, colors }: { data: { name: string; value: number; share: string }[]; colors?: string[] }) {
  const height = Math.max(160, data.length * 40 + 24)
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: TEXT_PRIMARY }} tickFormatter={(v: string) => truncate(v, 20)} axisLine={false} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: '#f3f5f8' }} content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', fontSize: 11, fill: TEXT_PRIMARY, formatter: (v: number) => nf.format(v) }}>
            {data.map((d, i) => <Cell key={d.name} fill={colors?.[i] || SERIES_1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function ReportsClient({ initialReport, initialError }: { initialReport: LeadsReport | null; initialError: string | null }) {
  const [report, setReport] = useState(initialReport)
  const [error, setError] = useState(initialError)
  const [range, setRange] = useState<ReportRange>(initialReport?.range || 'all')
  const [isPending, startTransition] = useTransition()

  const load = (next: ReportRange) => {
    setRange(next)
    startTransition(async () => {
      const res = await getLeadsReport(next)
      setReport(res.data)
      setError(res.error)
    })
  }

  const view = useMemo(() => {
    if (!report) return null
    const total = report.total
    const countOf = new Map(report.byStatus.map(s => [s.key, s.count]))

    // Every configured status, plus any status present in data but not configured.
    // Follow ups are not a status: they have their own card (report.followUp).
    const configured = [...report.statuses].sort((a, b) => a.sort_order - b.sort_order)
    const known = new Set(configured.map(s => s.key.toLowerCase()))
    const orphan = report.byStatus.filter(s => !known.has(s.key)).map(s => ({
      key: s.key, name: s.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      color_bg: 'bg-gray-100', color_text: 'text-gray-700', color_border: 'border-gray-200', sort_order: 999,
    }))
    const statusCards = [...configured, ...orphan].map(s => ({ ...s, count: countOf.get(s.key.toLowerCase()) || 0 }))

    const statusBars = statusCards.map(s => ({ name: s.name, value: s.count, share: pct(s.count, total), color: hueFromClass(s.color_text || s.color_bg) }))

    const sourceName = new Map(report.sources.map(s => [s.key, s.name]))
    const sourceBars = [
      ...report.bySource.map(s => ({ name: sourceName.get(s.key) || s.key, value: s.count, share: pct(s.count, total) })),
      ...(report.unmatchedSource > 0 ? [{ name: 'Other / Unknown', value: report.unmatchedSource, share: pct(report.unmatchedSource, total) }] : []),
    ].sort((a, b) => b.value - a.value)

    // Top 9 projects + "Other projects" fold (no row explosion)
    const projects = report.byProject
    const top = projects.slice(0, 9).map(p => ({ name: p.name, value: p.count, share: pct(p.count, total) }))
    const rest = projects.slice(9).reduce((a, p) => a + p.count, 0)
    const projectBars = rest > 0 ? [...top, { name: `Other projects (${projects.length - 9})`, value: rest, share: pct(rest, total) }] : top

    return { total, statusCards, statusBars, sourceBars, projectBars, trend: buildTrend(report) }
  }, [report])

  const rangeLabel = RANGES.find(r => r.value === range)?.label || ''

  return (
    <div className="w-full min-w-0 space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0f1d33]">Reports & Analytics</h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5a6a82]">Exact counts across all leads · India time (IST)</p>
        </div>
        <button
          onClick={() => load(range)}
          disabled={isPending}
          className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg border border-[#e8ecf2] bg-white px-3 text-xs font-semibold text-[#1e3a5f] hover:bg-[#f8fafc] disabled:opacity-60 cursor-pointer sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Range filter: one row, scrolls horizontally on small screens */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="inline-flex gap-1 rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] p-1" role="group" aria-label="Date range">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => load(r.value)}
              disabled={isPending}
              aria-pressed={range === r.value}
              className={`min-h-[36px] whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-wait ${range === r.value ? 'bg-[#0f1d33] text-white shadow-xs' : 'text-[#5a6a82] hover:bg-white hover:text-[#0f1d33]'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Could not load report: {error}
        </div>
      )}

      {view && (
        <div className={`space-y-5 md:space-y-6 transition-opacity ${isPending ? 'opacity-60' : ''}`} aria-busy={isPending}>
          {/* KPI cards: total + every lead status with its badge */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-[#0f1d33] bg-[#0f1d33] p-3 sm:p-4 md:p-5 text-white">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] sm:text-xs font-semibold text-white/80">Total Leads</span>
                <Database className="h-4 w-4 shrink-0 text-white/70" />
              </div>
              <div className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold tabular-nums">{nf.format(view.total)}</div>
              <div className="mt-1 truncate text-[10px] sm:text-[11px] text-white/70">{rangeLabel}</div>
            </div>

            {/* Follow Ups: live action snapshot (independent of the date range) */}
            {(() => {
              const fu = report!.followUp
              const cell = 'min-w-0 rounded-lg px-2 py-1.5 text-center'
              return (
                <div className="col-span-2 min-w-0 rounded-xl border border-orange-200 bg-white p-3 sm:p-4 md:p-5 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold bg-orange-50 text-orange-700 border-orange-200">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      <span className="truncate">Follow Ups</span>
                    </span>
                    <span className="truncate text-[10px] sm:text-[11px] text-[#8a99ad]">Right now</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold tabular-nums text-[#0f1d33]">{nf.format(fu.total)}</span>
                    <span className="text-[10px] sm:text-xs font-semibold text-[#5a6a82]">scheduled</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
                    <div className={`${cell} bg-red-50`}>
                      <div className="text-sm sm:text-base font-bold tabular-nums text-red-700">{nf.format(fu.overdue)}</div>
                      <div className="truncate text-[10px] sm:text-[11px] font-semibold text-red-700">Overdue</div>
                    </div>
                    <div className={`${cell} bg-orange-50`}>
                      <div className="text-sm sm:text-base font-bold tabular-nums text-orange-700">{nf.format(fu.due_today)}</div>
                      <div className="truncate text-[10px] sm:text-[11px] font-semibold text-orange-700">Due today</div>
                    </div>
                    <div className={`${cell} bg-[#f3f5f8]`}>
                      <div className="text-sm sm:text-base font-bold tabular-nums text-[#0f1d33]">{nf.format(fu.upcoming)}</div>
                      <div className="truncate text-[10px] sm:text-[11px] font-semibold text-[#5a6a82]">Upcoming</div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {view.statusCards.map(s => {
              return (
                <div key={s.key} className="min-w-0 rounded-xl border border-[#e8ecf2] bg-white p-3 sm:p-4 md:p-5 shadow-xs">
                  <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold ${s.color_bg} ${s.color_text} ${s.color_border || 'border-transparent'}`}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold tabular-nums text-[#0f1d33]">{nf.format(s.count)}</span>
                    <span className="text-[10px] sm:text-xs font-semibold text-[#5a6a82] tabular-nums">{pct(s.count, view.total)}</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] sm:text-[11px] text-[#8a99ad]">of {rangeLabel.toLowerCase()} leads</div>
                </div>
              )
            })}
          </div>

          {/* Trend: single series → no legend; title names it */}
          <ChartCard
            title="New Leads Over Time"
            subtitle={`${view.trend.unit === 'day' ? 'Per day' : 'Per month'} · ${rangeLabel}`}
            rows={view.trend.points.map(p => ({ label: p.full, value: p.count }))}
          >
            <ScrollableTrend points={view.trend.points.length}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={view.trend.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={SERIES_1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} minTickGap={8} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip cursor={{ stroke: '#c3cbd6', strokeWidth: 1 }} content={<ChartTooltip title={(p: any) => p.full} />} />
                  <Area type="monotone" dataKey="count" name="Leads" stroke={SERIES_1} strokeWidth={2} fill="url(#trendFill)"
                    dot={view.trend.points.length <= 31 ? { r: 3, fill: SERIES_1, strokeWidth: 0 } : false}
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ScrollableTrend>
          </ChartCard>

          <div className="grid grid-cols-1 items-start gap-5 md:gap-6 lg:grid-cols-2">
            <ChartCard title="Leads by Status" subtitle="Bar colour matches each status badge" rows={view.statusBars.map(b => ({ label: b.name, value: b.value, share: b.share }))}>
              <HBarChart data={view.statusBars} colors={view.statusBars.map(b => b.color)} />
            </ChartCard>

            <ChartCard title="Leads by Source" subtitle="Matched the same way as the Leads page filter" rows={view.sourceBars.map(b => ({ label: b.name, value: b.value, share: b.share }))}>
              <HBarChart data={view.sourceBars} />
            </ChartCard>
          </div>

          <ChartCard title="Leads by Project" subtitle={view.projectBars.length > 9 ? 'Top 9 projects · rest grouped' : 'All projects'} rows={view.projectBars.map(b => ({ label: b.name, value: b.value, share: b.share }))}>
            <HBarChart data={view.projectBars} />
          </ChartCard>
        </div>
      )}
    </div>
  )
}
