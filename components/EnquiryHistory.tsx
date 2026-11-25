'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2, Repeat, UserPlus, X } from 'lucide-react'
import { formatFollowUpShort } from '@/lib/lead-status'
import { isNewRepeatEnquiry } from '@/lib/lead-fields'
import { getLeadEnquiries, type EnquiryEntry } from '@/app/crm/leads/actions'

/**
 * "Enquired N×" badge: the same phone number enquired more than once (REQ-96).
 * Shows "New enquiry" when the latest one came in today. Click → EnquiryHistoryDialog.
 */
export function EnquiryBadge({
  lead, onClick, size = 'sm',
}: {
  lead: { enquiry_count?: number | null; last_enquiry_at?: string | null }
  onClick: () => void
  /** 'md' = 40px touch target (mobile cards) */
  size?: 'sm' | 'md'
}) {
  const count = Number(lead.enquiry_count) || 1
  if (count < 2) return null
  const fresh = isNewRepeatEnquiry(lead)
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title="This phone number enquired more than once. Click to see the history."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 ${size === 'md' ? 'min-h-[40px] px-3' : 'min-h-[26px]'} text-[11px] font-bold text-violet-700 hover:bg-violet-100 cursor-pointer`}
    >
      <Repeat className="h-3 w-3 shrink-0" /> Enquired {count}×
      {fresh && <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-bold text-white" title="Enquired again today">New</span>}
    </button>
  )
}

/** Everything this person (phone number) enquired about, newest first. */
export function EnquiryHistoryDialog({
  lead, onClose,
}: {
  lead: { id: string; name?: string | null; phone?: string | null }
  onClose: () => void
}) {
  const [entries, setEntries] = useState<EnquiryEntry[] | null>(null)
  const [leadEmail, setLeadEmail] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getLeadEnquiries(lead.id)
      .then((res) => { if (!alive) return; if (res.error) setError(res.error); else { setEntries(res.data); setLeadEmail(res.email || null) } })
      .catch(() => alive && setError('Could not load the enquiry history.'))
    return () => { alive = false }
  }, [lead.id])

  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = orig; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div
        className="flex w-full sm:max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Enquiry history"
      >
        <div className="flex items-center justify-between border-b border-[#e8ecf2] px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#0f1d33]">
              <Repeat className="h-5 w-5 shrink-0 text-violet-600" /> Enquiry history
            </h2>
            <p className="truncate text-xs text-[#5a6a82]">
              {[lead.name, lead.phone].filter(Boolean).join(' · ')}
              {entries ? ` · ${entries.length} ${entries.length === 1 ? 'enquiry' : 'enquiries'}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label="Close">
            <X className="h-5 w-5 text-[#5a6a82]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : entries === null ? (
            <p className="flex items-center gap-2 text-sm text-[#5a6a82]"><Loader2 className="h-4 w-4 animate-spin" /> Loading history...</p>
          ) : entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#d0d7e2] p-3 text-center text-sm text-[#5a6a82]">No enquiries recorded.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {entries.map((e, i) => {
                const meta = e.kind === 'meta'
                const Icon = meta ? FileText : UserPlus
                const number = entries.length - i
                const otherEmail = e.email && leadEmail && e.email.toLowerCase() !== leadEmail.toLowerCase()
                return (
                  <li key={e.id} className="rounded-xl border border-[#e8ecf2] bg-white">
                    {/* Header: which enquiry, when, from where */}
                    <div className="flex items-center justify-between gap-2 border-b border-[#eef1f6] bg-[#f8fafc] px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta ? 'bg-blue-50 text-blue-700' : 'bg-[#eef1f6] text-[#1e3a5f]'}`}><Icon className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#0f1d33]">Enquiry {number}{number === 1 && entries.length > 1 ? ' (first)' : i === 0 && entries.length > 1 ? ' (latest)' : ''}</div>
                          <div className="text-[11px] text-[#5a6a82]">{formatFollowUpShort(e.at)}</div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta ? 'bg-blue-100 text-blue-800' : 'bg-[#eef1f6] text-[#1e3a5f]'}`}>{e.source}</span>
                    </div>

                    <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-3 py-2.5 text-xs">
                      <dt className="font-semibold text-[#8a99ad]">Project</dt>
                      <dd className={e.project ? 'font-semibold text-[#0f1d33]' : 'text-amber-700'}>{e.project || 'Not set'}</dd>
                      {meta && (<><dt className="font-semibold text-[#8a99ad]">Form</dt><dd className="break-words text-[#0f1d33]">{e.formName || e.formId || '-'}</dd></>)}
                      {e.enquiryType && (<><dt className="font-semibold text-[#8a99ad]">Enquiry type</dt><dd className="text-[#0f1d33]">{e.enquiryType}</dd></>)}
                      {!meta && e.by && (<><dt className="font-semibold text-[#8a99ad]">{e.imported ? 'Imported by' : 'Added by'}</dt><dd className="text-[#0f1d33]">{e.by}</dd></>)}
                      {(e.email || e.phone) && (
                        <><dt className="font-semibold text-[#8a99ad]">Contact used</dt>
                        <dd className="break-words text-[#0f1d33]">{[e.phone, e.email].filter(Boolean).join(' · ')}{otherEmail && <span className="ml-1 rounded bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-800">different email</span>}</dd></>
                      )}
                    </dl>

                    {/* What they said this time */}
                    {(e.answers.length > 0 || e.message) && (
                      <div className="border-t border-[#eef1f6] px-3 py-2.5">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{meta ? 'Their answers' : 'Notes'}</div>
                        {e.answers.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {e.answers.map((a, k) => (
                              <li key={k} className="break-words"><span className="text-[#5a6a82]">{a.question}:</span> <span className="font-semibold text-[#0f1d33]">{a.answer}</span></li>
                            ))}
                          </ul>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm text-[#334155]">{e.message}</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
