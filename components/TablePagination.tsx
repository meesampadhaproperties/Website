'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Shared pagination footer for every table/list.
 * "Showing 51–100 of 230" + Prev/Next with 40px+ touch targets. Hidden when everything fits on one page.
 */
export default function TablePagination({
  page, pageSize, total, onPageChange, label = 'items', disabled = false,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  label?: string
  disabled?: boolean
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const btn = 'inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg border border-[#e8ecf2] bg-white px-3 text-xs font-semibold text-[#0f1d33] hover:bg-[#f3f5f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
  return (
    <div className="flex flex-col gap-2 border-t border-[#e8ecf2] bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-xs text-[#5a6a82]">
        Showing <span className="font-semibold text-[#0f1d33] tabular-nums">{from}–{to}</span> of{' '}
        <span className="font-semibold text-[#0f1d33] tabular-nums">{total}</span> {label}
      </p>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button className={btn} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Prev</span>
        </button>
        <span className="text-xs font-semibold text-[#5a6a82] tabular-nums">Page {page} of {totalPages}</span>
        <button className={btn} disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
