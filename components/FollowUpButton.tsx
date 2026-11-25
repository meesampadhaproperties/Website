'use client'

import { CalendarClock, CalendarPlus } from 'lucide-react'
import { followUpDueState, formatFollowUpShort } from '@/lib/lead-status'

const STATE_STYLE = {
  overdue: 'border-red-200 bg-red-50 text-red-700',
  today: 'border-orange-200 bg-orange-50 text-orange-700',
  upcoming: 'border-[#d6e0ee] bg-[#f3f6fb] text-[#1e3a5f]',
} as const

/**
 * Per-lead Follow up button: shows the pending follow up (red when overdue, orange when due
 * later today), or "Follow up" when none. Opens the FollowUpDialog.
 */
export default function FollowUpButton({
  lead, canEdit, onClick, size = 'sm',
}: {
  lead: { follow_up_at?: string | null; follow_up_note?: string | null }
  canEdit: boolean
  onClick: () => void
  /** 'md' = 40px touch target (mobile cards) */
  size?: 'sm' | 'md'
}) {
  const state = followUpDueState(lead.follow_up_at)
  const height = size === 'md' ? 'min-h-[40px] px-3' : 'min-h-[30px] px-2.5'
  const handle = (e: React.MouseEvent) => { e.stopPropagation(); onClick() }

  if (state) {
    return (
      <button
        type="button"
        onClick={handle}
        title={lead.follow_up_note || 'Follow up'}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border ${height} text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-85 cursor-pointer ${STATE_STYLE[state]}`}
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{formatFollowUpShort(lead.follow_up_at)}</span>
        {state === 'overdue' && <span className="shrink-0">· Overdue</span>}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handle}
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#cbd5e1] ${height} text-xs font-semibold whitespace-nowrap text-[#5a6a82] transition-colors hover:bg-[#f3f5f8] hover:text-[#0f1d33] cursor-pointer`}
    >
      <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
      {canEdit ? 'Follow up' : 'History'}
    </button>
  )
}
