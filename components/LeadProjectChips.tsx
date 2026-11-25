'use client'

import { leadProjectsForDisplay } from '@/lib/lead-fields'

/**
 * A lead's projects on ONE line (REQ-95/96): the current project (truncated, full name on hover)
 * plus "+N" for the other projects this person asked about (listed on hover; the enquiry
 * history popup shows them all). Meta leads from an unlinked form show "Project not set".
 */
export default function LeadProjectChips({
  lead, autoCaptured, label = true,
}: {
  lead: { project?: string | null; enquiry_projects?: string[] | null }
  autoCaptured: boolean
  /** Prefix "Project:" (off where the column header already says Project) */
  label?: boolean
}) {
  const list = leadProjectsForDisplay(lead)
  if (list.length === 0) {
    return autoCaptured ? (
      <span
        className="inline-block whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
        title="Link this lead's Meta form to a project (Meta page or Leads → form settings)"
      >
        Project not set
      </span>
    ) : null
  }
  const [main, ...others] = list
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1">
      <span
        title={main}
        className="inline-block min-w-0 max-w-[190px] truncate whitespace-nowrap rounded border border-brand/20 bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-[#0f1d33]"
      >
        {label ? `Project: ${main}` : main}
      </span>
      {others.length > 0 && (
        <span
          title={`Also asked about: ${others.join(', ')}`}
          className="shrink-0 whitespace-nowrap rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-bold text-[#5a6a82]"
        >
          +{others.length}
        </span>
      )}
    </div>
  )
}
