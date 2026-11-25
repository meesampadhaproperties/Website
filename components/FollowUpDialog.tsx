'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CalendarPlus, CheckCircle2, Loader2, Pencil, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getIstCurrentDateString } from '@/lib/timezone'
import {
  FOLLOW_UP_ACTIVITY, FOLLOW_UP_NOTE_MAX, defaultFollowUpSlot, followUpDueState, formatFollowUpShort,
  isoToFollowUpParts, validateFollowUp,
} from '@/lib/lead-status'
import {
  completeFollowUp, getFollowUpHistory, removeFollowUp, scheduleFollowUp,
  type FollowUpLogEntry, type FollowUpState,
} from '@/app/crm/leads/actions'

export interface FollowUpLead {
  id: string
  name?: string | null
  follow_up_at?: string | null
  follow_up_note?: string | null
}

const STATE = {
  overdue: { box: 'border-red-200 bg-red-50', text: 'text-red-700', badge: 'Overdue' },
  today: { box: 'border-orange-200 bg-orange-50', text: 'text-orange-700', badge: 'Today' },
  upcoming: { box: 'border-[#d6e0ee] bg-[#f3f6fb]', text: 'text-[#1e3a5f]', badge: 'Upcoming' },
} as const

const HISTORY_ICON: Record<string, { icon: typeof CalendarPlus; tone: string }> = {
  [FOLLOW_UP_ACTIVITY.scheduled]: { icon: CalendarPlus, tone: 'bg-[#eef4ff] text-[#1e3a5f]' },
  [FOLLOW_UP_ACTIVITY.changed]: { icon: Pencil, tone: 'bg-orange-50 text-orange-700' },
  [FOLLOW_UP_ACTIVITY.done]: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
  [FOLLOW_UP_ACTIVITY.removed]: { icon: XCircle, tone: 'bg-[#f3f5f8] text-[#5a6a82]' },
}

/** What a history entry's time line says, e.g. "Moved from 24 Nov, 10:00 am to 25 Nov, 11:00 am". */
function historyWhen(e: FollowUpLogEntry): string {
  if (!e.dueAt) return ''
  if (e.type === FOLLOW_UP_ACTIVITY.changed && e.previousDueAt) {
    return `Moved from ${formatFollowUpShort(e.previousDueAt)} to ${formatFollowUpShort(e.dueAt)}`
  }
  if (e.type === FOLLOW_UP_ACTIVITY.done || e.type === FOLLOW_UP_ACTIVITY.removed) return `Was due ${formatFollowUpShort(e.dueAt)}`
  return `For ${formatFollowUpShort(e.dueAt)}`
}

/**
 * Follow up popup with two tabs:
 *  - Follow up: the pending follow up (Mark done / Remove) + a form to schedule or change it
 *  - History: every scheduled / changed / done / removed follow up, newest first, with who did it
 * Mobile: bottom sheet. Desktop: centered dialog. Esc / backdrop closes.
 */
export default function FollowUpDialog({
  lead, canEdit, onClose, onChange,
}: {
  lead: FollowUpLead
  /** 'edit' on Leads. Without it the popup is read-only. */
  canEdit: boolean
  onClose: () => void
  /** Called after every successful change so the list can update in place. */
  onChange: (state: FollowUpState) => void
}) {
  const [tab, setTab] = useState<'followup' | 'history'>('followup')
  const [current, setCurrent] = useState<FollowUpState>({
    follow_up_at: lead.follow_up_at || null,
    follow_up_note: lead.follow_up_note || null,
  })
  const [form, setForm] = useState(() => ({
    ...(isoToFollowUpParts(lead.follow_up_at) || defaultFollowUpSlot()),
    note: lead.follow_up_note || '',
  }))
  const [busy, setBusy] = useState<null | 'save' | 'done' | 'remove'>(null)
  const [formError, setFormError] = useState('')
  const [history, setHistory] = useState<FollowUpLogEntry[] | null>(null)
  const [historyError, setHistoryError] = useState('')

  const loadHistory = useCallback(async () => {
    try {
      const res = await getFollowUpHistory(lead.id)
      if (res.error) setHistoryError(res.error)
      else { setHistoryError(''); setHistory(res.data) }
    } catch {
      setHistoryError('Could not load the follow-up history.')
    }
  }, [lead.id])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = orig; window.removeEventListener('keydown', onKey) }
  }, [onClose, busy])

  const apply = (state: FollowUpState) => {
    setCurrent(state)
    onChange(state)
    loadHistory()
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const check = validateFollowUp(form)
    if ('error' in check) { setFormError(check.error); return }
    setBusy('save')
    try {
      const res = await scheduleFollowUp(lead.id, form)
      if ('error' in res) { setFormError(res.error); return }
      toast.success(current.follow_up_at ? 'Follow up changed' : 'Follow up scheduled', { description: formatFollowUpShort(res.follow_up_at) })
      apply({ follow_up_at: res.follow_up_at, follow_up_note: res.follow_up_note })
    } catch {
      setFormError('Could not save the follow up. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const close = async (kind: 'done' | 'remove') => {
    setBusy(kind)
    try {
      const res = kind === 'done' ? await completeFollowUp(lead.id) : await removeFollowUp(lead.id)
      if ('error' in res) { toast.error(res.error); return }
      toast.success(kind === 'done' ? 'Follow up marked as done' : 'Follow up removed')
      apply({ follow_up_at: null, follow_up_note: null })
      setForm({ ...defaultFollowUpSlot(), note: '' })
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const state = followUpDueState(current.follow_up_at)
  const input = 'w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-[#f8fafc] px-3 text-sm text-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]'
  const tabBtn = (active: boolean) =>
    `flex-1 min-h-[44px] border-b-2 text-sm font-semibold transition-colors cursor-pointer ${active ? 'border-[#0f1d33] text-[#0f1d33]' : 'border-transparent text-[#5a6a82] hover:text-[#0f1d33]'}`

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => !busy && onClose()}>
      <div
        className="flex w-full sm:max-w-md max-h-[90vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Follow up"
      >
        <div className="flex items-center justify-between border-b border-[#e8ecf2] px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#0f1d33]">
              <CalendarClock className="h-5 w-5 shrink-0 text-orange-600" /> Follow up
            </h2>
            {lead.name && <p className="truncate text-xs text-[#5a6a82]">{lead.name}</p>}
          </div>
          <button onClick={onClose} disabled={!!busy} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label="Close">
            <X className="h-5 w-5 text-[#5a6a82]" />
          </button>
        </div>

        <div className="flex border-b border-[#e8ecf2] px-4" role="tablist">
          <button role="tab" aria-selected={tab === 'followup'} className={tabBtn(tab === 'followup')} onClick={() => setTab('followup')}>
            Follow up
          </button>
          <button role="tab" aria-selected={tab === 'history'} className={tabBtn(tab === 'history')} onClick={() => setTab('history')}>
            History{history ? ` (${history.length})` : ''}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'followup' ? (
            <div className="flex flex-col gap-4">
              {state ? (
                <div className={`rounded-xl border p-3 ${STATE[state].box}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Next follow up</span>
                    <span className={`text-[11px] font-bold ${STATE[state].text}`}>{STATE[state].badge}</span>
                  </div>
                  <div className={`mt-1 text-base font-bold ${STATE[state].text}`}>{formatFollowUpShort(current.follow_up_at)}</div>
                  {current.follow_up_note && <p className="mt-1 whitespace-pre-wrap text-sm text-[#334155]">{current.follow_up_note}</p>}
                  {canEdit && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => close('done')}
                        disabled={!!busy}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                      >
                        {busy === 'done' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark done
                      </button>
                      <button
                        type="button"
                        onClick={() => close('remove')}
                        disabled={!!busy}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 cursor-pointer"
                      >
                        {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[#d0d7e2] p-3 text-center text-sm text-[#5a6a82]">No follow up scheduled.</p>
              )}

              {canEdit ? (
                <form onSubmit={save} className="flex flex-col gap-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">
                    {current.follow_up_at ? 'Change follow up' : 'Schedule follow up'}
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="text-xs font-semibold text-[#5a6a82]">Date
                      <input type="date" required min={getIstCurrentDateString()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${input} mt-1`} />
                    </label>
                    <label className="text-xs font-semibold text-[#5a6a82]">Time (IST)
                      <input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`${input} mt-1`} />
                    </label>
                  </div>
                  <label className="text-xs font-semibold text-[#5a6a82]">Note
                    <textarea required maxLength={FOLLOW_UP_NOTE_MAX} rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Call back about site visit pricing" className={`${input} mt-1 py-2 resize-y`} />
                  </label>
                  {formError && <p className="text-xs font-semibold text-red-600" role="alert">{formError}</p>}
                  <button type="submit" disabled={!!busy} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer">
                    {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {current.follow_up_at ? 'Save changes' : 'Save follow up'}
                  </button>
                </form>
              ) : (
                <p className="text-xs text-[#8a99ad]">View only: you can see follow ups but not change them.</p>
              )}
            </div>
          ) : (
            <div>
              {historyError ? (
                <p className="text-sm text-red-600">{historyError}</p>
              ) : history === null ? (
                <p className="flex items-center gap-2 text-sm text-[#5a6a82]"><Loader2 className="h-4 w-4 animate-spin" /> Loading history...</p>
              ) : history.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#d0d7e2] p-3 text-center text-sm text-[#5a6a82]">No follow ups yet.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {history.map((h) => {
                    const look = HISTORY_ICON[h.type] || HISTORY_ICON[FOLLOW_UP_ACTIVITY.scheduled]
                    const Icon = look.icon
                    return (
                      <li key={h.id} className="flex gap-3 rounded-xl border border-[#e8ecf2] p-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${look.tone}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#0f1d33]">{h.label}</div>
                          {historyWhen(h) && <div className="text-xs font-medium text-[#1e3a5f]">{historyWhen(h)}</div>}
                          {h.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#334155]">{h.note}</p>}
                          <div className="mt-1 text-[11px] text-[#8a99ad]">{h.by ? `${h.by} · ` : ''}{formatFollowUpShort(h.at)}</div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
