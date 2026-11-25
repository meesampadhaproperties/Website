'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Loader2, Mail, Phone, Search, Send, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'
import MessageComposer, { type MessageChannel } from '@/components/MessageComposer'
import { SmsWalletCard } from '@/components/SmsWalletCard'
import { isAutoCapturedLead, sourceLabel } from '@/lib/lead-source'
import { isValidEmail } from '@/lib/outreach'
import { phoneMatchKey } from '@/lib/lead-phone'
import { getBulkLeads, getBulkLeadsForSelection, type BulkFilters, type BulkLead } from './actions'

const PAGE_SIZE = 50

type Options = {
  statuses: { key: string; name: string; color_bg?: string; color_text?: string; color_border?: string }[]
  sources: { key: string; name: string }[]
}

const WhatsAppGlyph = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.42 9.42 0 1 1 7.99 4.42m8.02-17.44A11.33 11.33 0 0 0 12.04.75C5.8.75.72 5.83.72 12.07c0 2 .52 3.94 1.51 5.65L.62 23.62l6.04-1.58a11.3 11.3 0 0 0 5.38 1.37h.01c6.24 0 11.32-5.08 11.32-11.32 0-3.03-1.18-5.87-3.31-8.01" />
  </svg>
)

/**
 * Bulk Sender (REQ-103): search + filter leads, select one / some / all, and send a custom
 * Email, an SMS or a WhatsApp message. Table on wide screens (no sideways scrolling), cards below.
 */
export default function BulkSenderClient({
  options, initialLeads, initialCount, canSend,
}: {
  options: Options
  initialLeads: BulkLead[]
  initialCount: number
  /** 'edit' on Bulk Sender. View-only users can browse but not send. */
  canSend: boolean
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [leads, setLeads] = useState<BulkLead[]>(initialLeads)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Map<string, BulkLead>>(new Map())
  const [selectingAll, setSelectingAll] = useState(false)
  const [composer, setComposer] = useState<{ leads: BulkLead[]; channel: MessageChannel } | null>(null)
  const [walletKey, setWalletKey] = useState(0)
  const firstLoad = useRef(true)

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t) }, [search])
  const filters: BulkFilters = useMemo(() => ({ search: debounced, source, status }), [debounced, source, status])
  useEffect(() => { setPage(1) }, [filters])

  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return }
    let alive = true
    setLoading(true)
    getBulkLeads(filters, page, PAGE_SIZE)
      .then((res) => { if (!alive) return; if (res.error) toast.error(res.error); setLeads(res.data); setCount(res.count) })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [filters, page])

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const statusOf = (key?: string | null) => options.statuses.find((s) => s.key === (key || 'new'))
  const sourceText = (l: BulkLead) => (isAutoCapturedLead(l.source_page, l.form_id) ? 'Meta' : sourceLabel(l.source_page, options.sources) || '-')
  const dateOf = (l: BulkLead) => new Date(l.last_enquiry_at || l.created_at)

  const toggle = (l: BulkLead) => setSelected((prev) => { const m = new Map(prev); if (m.has(l.id)) m.delete(l.id); else m.set(l.id, l); return m })
  const pageAllSelected = leads.length > 0 && leads.every((l) => selected.has(l.id))
  const togglePage = () => setSelected((prev) => {
    const m = new Map(prev)
    if (pageAllSelected) leads.forEach((l) => m.delete(l.id)); else leads.forEach((l) => m.set(l.id, l))
    return m
  })
  const selectAllMatching = async () => {
    setSelectingAll(true)
    try {
      const res = await getBulkLeadsForSelection(filters)
      if (res.error) { toast.error(res.error); return }
      setSelected(new Map(res.data.map((l) => [l.id, l])))
      if (res.capped) toast.info(`Selected the first ${res.data.length} of ${res.count}. Up to ${res.data.length} leads can be messaged at once.`)
    } finally {
      setSelectingAll(false)
    }
  }

  const selectedList = [...selected.values()]
  const open = (list: BulkLead[], channel: MessageChannel) => setComposer({ leads: list, channel })
  const sendBtn = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const iconBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
  const select = 'min-h-[44px] w-full appearance-none rounded-lg border border-[#e8ecf2] bg-white pl-3 pr-9 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f] cursor-pointer'

  const rowActions = (l: BulkLead, labelled = false) => (
    <>
      <button type="button" onClick={() => open([l], 'sms')} disabled={!phoneMatchKey(l.phone)} title="Send SMS" aria-label="Send SMS"
        className={labelled ? `${sendBtn} border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100` : `${iconBtn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white`}>
        <Smartphone className="h-4 w-4" />{labelled && 'SMS'}
      </button>
      <button type="button" onClick={() => open([l], 'whatsapp')} disabled={!phoneMatchKey(l.phone)} title="Send WhatsApp" aria-label="Send WhatsApp"
        className={labelled ? `${sendBtn} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100` : `${iconBtn} border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-[#25D366] hover:text-white`}>
        <WhatsAppGlyph className="h-4 w-4" />{labelled && 'WhatsApp'}
      </button>
      <button type="button" onClick={() => open([l], 'email')} disabled={!isValidEmail(l.email)} title={l.email ? `Send email to ${l.email}` : 'No email address'} aria-label="Send email"
        className={labelled ? `${sendBtn} border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100` : `${iconBtn} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white`}>
        <Mail className="h-4 w-4" />{labelled && 'Email'}
      </button>
    </>
  )

  const StatusBadge = ({ l }: { l: BulkLead }) => {
    const s = statusOf(l.status)
    return (
      <span className={`inline-block max-w-full truncate rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s ? `${s.color_bg} ${s.color_text} ${s.color_border || 'border-transparent'}` : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
        {s?.name || l.status || 'New'}
      </span>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {composer && <MessageComposer leads={composer.leads} initialChannel={composer.channel} onClose={() => { setComposer(null); setWalletKey((k) => k + 1) }} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-[#0f1d33]"><Send className="h-6 w-6 text-[#1e3a5f]" /> Bulk Sender</h1>
          <p className="mt-1 text-sm text-[#5a6a82]">Select one lead, a few, or all of them, and send an email, SMS or WhatsApp message.</p>
        </div>
        <SmsWalletCard refreshKey={walletKey} />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:gap-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a99ad]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email or project"
            className="min-h-[44px] w-full rounded-lg border border-[#e8ecf2] bg-white pl-9 pr-9 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f]" aria-label="Search leads" />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#8a99ad] hover:text-[#0f1d33] cursor-pointer" aria-label="Clear search"><X className="h-4 w-4" /></button>}
        </label>
        <div className="relative sm:w-48">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={select} aria-label="Filter by source">
            <option value="all">All sources</option>
            {options.sources.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a82]" />
        </div>
        <div className="relative sm:w-48">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={select} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {options.statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a82]" />
        </div>
      </div>

      {/* Selection bar */}
      {canSend && (
        <div className={`sticky top-16 md:top-0 z-20 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${selected.size ? 'border-[#1e3a5f]/30 bg-[#eef4ff]' : 'border-[#e8ecf2] bg-white'}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold text-[#0f1d33]">{selected.size ? `${selected.size} selected` : 'No leads selected'}</span>
            {count > leads.length && (
              <button type="button" onClick={selectAllMatching} disabled={selectingAll} className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-[#1e3a5f] underline cursor-pointer disabled:opacity-60">
                {selectingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Select all {count} matching
              </button>
            )}
            {selected.size > 0 && <button type="button" onClick={() => setSelected(new Map())} className="min-h-[32px] font-semibold text-[#5a6a82] hover:text-[#0f1d33] cursor-pointer">Clear</button>}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <button type="button" disabled={!selected.size} onClick={() => open(selectedList, 'email')} className={`${sendBtn} justify-center bg-indigo-600 text-white hover:bg-indigo-700`}><Mail className="h-4 w-4" /> Email</button>
            <button type="button" disabled={!selected.size} onClick={() => open(selectedList, 'sms')} className={`${sendBtn} justify-center bg-sky-600 text-white hover:bg-sky-700`}><Smartphone className="h-4 w-4" /> SMS</button>
            <button type="button" disabled={!selected.size} onClick={() => open(selectedList, 'whatsapp')} className={`${sendBtn} justify-center bg-[#1ea952] text-white hover:bg-[#178a43]`}><WhatsAppGlyph className="h-4 w-4" /> WhatsApp</button>
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-[#e8ecf2] bg-white shadow-xs">
        {loading && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-[#1e3a5f]" />}

        {/* Wide screens: table that fits (fixed layout, no sideways scrolling) */}
        <table className="hidden w-full table-fixed text-left text-sm xl:table">
          <thead className="border-b border-[#e8ecf2] bg-[#f3f5f8] text-xs font-semibold uppercase text-[#1e3a5f]">
            <tr>
              {canSend && (
                <th className="w-11 px-3 py-3">
                  <input type="checkbox" checked={pageAllSelected} onChange={togglePage} className="h-4 w-4 rounded border-[#cbd5e1] cursor-pointer" aria-label="Select all on this page" />
                </th>
              )}
              <th className="w-16 px-3 py-3">Sr. No</th>
              <th className="w-[118px] px-3 py-3">Date</th>
              <th className="px-3 py-3">Name</th>
              <th className="w-[24%] px-3 py-3">Contact</th>
              <th className="w-[120px] px-3 py-3">Source</th>
              <th className="w-[140px] px-3 py-3">Status</th>
              {canSend && <th className="w-[148px] px-3 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8ecf2]">
            {leads.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-[#5a6a82]">No leads match these filters.</td></tr>
            ) : leads.map((l, i) => (
              <tr key={l.id} className={`align-middle transition-colors ${selected.has(l.id) ? 'bg-[#f4f8ff]' : 'hover:bg-[#f8fafc]'}`}>
                {canSend && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l)} className="h-4 w-4 rounded border-[#cbd5e1] cursor-pointer" aria-label={`Select ${l.name || 'lead'}`} />
                  </td>
                )}
                <td className="px-3 py-2.5 text-[#5a6a82]">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-[#0f1d33]">{dateOf(l).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div className="text-xs text-[#8a99ad]">{dateOf(l).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="truncate font-semibold text-[#0f1d33]" title={l.name || ''}>{l.name || '-'}</div>
                  {(Number(l.enquiry_count) || 1) > 1 && <div className="text-[11px] font-semibold text-violet-700">Enquired {l.enquiry_count}×</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="truncate text-[#0f1d33]">{l.phone || '-'}</div>
                  <div className="truncate text-xs text-[#8a99ad]" title={l.email || ''}>{l.email || 'No email'}</div>
                </td>
                <td className="px-3 py-2.5"><span className="inline-block max-w-full truncate rounded-full bg-[#f3f5f8] px-2.5 py-0.5 text-[11px] font-medium text-[#1e3a5f]">{sourceText(l)}</span></td>
                <td className="px-3 py-2.5"><StatusBadge l={l} /></td>
                {canSend && <td className="px-3 py-2.5"><div className="flex justify-end gap-1.5">{rowActions(l)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Phones and tablets: cards */}
        <div className="divide-y divide-[#e8ecf2] xl:hidden">
          {canSend && leads.length > 0 && (
            <label className="flex min-h-[44px] items-center gap-3 bg-[#f8fafc] px-4 text-sm font-semibold text-[#1e3a5f]">
              <input type="checkbox" checked={pageAllSelected} onChange={togglePage} className="h-5 w-5 rounded border-[#cbd5e1]" /> Select all on this page
            </label>
          )}
          {leads.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#5a6a82]">No leads match these filters.</p>
          ) : leads.map((l, i) => (
            <div key={l.id} className={`flex gap-3 p-4 ${selected.has(l.id) ? 'bg-[#f4f8ff]' : ''}`}>
              {canSend && <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#cbd5e1]" aria-label={`Select ${l.name || 'lead'}`} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#0f1d33]">{l.name || '-'}</div>
                    <div className="text-xs text-[#8a99ad]">#{(page - 1) * PAGE_SIZE + i + 1} · {dateOf(l).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })}{(Number(l.enquiry_count) || 1) > 1 ? ` · Enquired ${l.enquiry_count}×` : ''}</div>
                  </div>
                  <StatusBadge l={l} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  <span className="inline-flex items-center gap-1 text-[#0f1d33]"><Phone className="h-3.5 w-3.5 text-[#8a99ad]" /> {l.phone || '-'}</span>
                  {l.email && <span className="min-w-0 truncate text-xs text-[#5a6a82]">{l.email}</span>}
                  <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-medium text-[#1e3a5f]">{sourceText(l)}</span>
                </div>
                {canSend && <div className="mt-2.5 flex flex-wrap gap-2">{rowActions(l, true)}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#5a6a82]">
        <span>{count} lead{count === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e8ecf2] bg-white disabled:opacity-40 cursor-pointer" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[90px] text-center">Page {page} of {pages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e8ecf2] bg-white disabled:opacity-40 cursor-pointer" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}
