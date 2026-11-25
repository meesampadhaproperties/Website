'use client'

/**
 * CRM on/off switch for a Meta lead form.
 * ON (Active) = leads from this form come into the CRM. OFF (Inactive) = they are ignored.
 * Used on both the Leads page (Configured Form IDs) and the Meta page (Discovered Forms).
 */
export function FormImportSwitch({ on, onToggle, disabled, onTitle, offTitle }: {
  on: boolean; onToggle: () => void; disabled?: boolean
  /** Tooltip / screen-reader text when on and off (defaults describe lead importing) */
  onTitle?: string; offTitle?: string
}) {
  const title = on ? (onTitle || 'Importing leads into the CRM. Click to stop.') : (offTitle || 'Not importing leads. Click to start.')
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      title={title}
      onClick={onToggle}
      disabled={disabled}
      className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-1.5 cursor-pointer disabled:cursor-wait disabled:opacity-60"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
      <span className={`w-14 text-left text-xs font-semibold ${on ? 'text-emerald-700' : 'text-slate-500'}`}>{on ? 'Active' : 'Inactive'}</span>
    </button>
  )
}
