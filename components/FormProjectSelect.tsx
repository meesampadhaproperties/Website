'use client'

import { ChevronDown } from 'lucide-react'

/**
 * Which project (Projects page) a Meta form's leads are about (REQ-95).
 * Amber when not linked: leads from that form show "Project not set".
 * Used on the Meta page (Discovered Forms) and the Leads page (form settings).
 */
export function FormProjectSelect({
  value, projects, disabled, onChange,
}: {
  value?: string | null
  projects: { id: string; name: string }[]
  disabled?: boolean
  onChange: (projectId: string | null) => void
}) {
  const linked = !!value && projects.some((p) => p.id === value)
  return (
    <div className="relative shrink-0">
      <select
        value={linked ? (value as string) : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Project for this form's leads"
        title="Leads from this form get this project"
        className={`min-h-10 max-w-[200px] appearance-none truncate rounded-lg border pl-2.5 pr-7 text-xs font-semibold cursor-pointer disabled:cursor-default disabled:opacity-70 ${linked ? 'border-[#e8ecf2] bg-white text-[#0f1d33]' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
      >
        <option value="">Project not set</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
    </div>
  )
}
