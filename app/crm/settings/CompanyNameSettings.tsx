'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { COMPANY_NAME_CACHE_KEY, COMPANY_NAME_EVENT, COMPANY_NAME_MAX } from '@/lib/company-name'
import { getCompanyNameAction, saveCompanyNameAction } from './company-actions'

/** Settings → Company name (REQ-104). Shown in the sidebar under the logo. Super Admin only. */
export default function CompanyNameSettings() {
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCompanyNameAction().then((r) => { setName(r.name); setSaved(r.name) }).finally(() => setLoading(false))
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await saveCompanyNameAction(name)
    setSaving(false)
    if (!res.success) { toast.error(res.error || 'Could not save'); return }
    setSaved(res.name || '')
    setName(res.name || '')
    try { localStorage.setItem(COMPANY_NAME_CACHE_KEY, res.name || '') } catch {}
    window.dispatchEvent(new CustomEvent(COMPANY_NAME_EVENT, { detail: res.name || '' }))
    toast.success(res.name ? 'Company name saved' : 'Company name removed')
  }

  return (
    <div className="rounded-2xl border border-[#e8ecf2] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[#e8ecf2] px-6 py-5 bg-[#fafbfc]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0f1d33] flex items-center justify-center text-brand shadow-xs"><Building2 size={16} /></div>
          <div>
            <h2 className="text-base font-bold text-[#0f1d33]">Company name</h2>
            <p className="text-xs text-[#5a6a82]">Shown in the sidebar under the logo, for everyone.</p>
          </div>
        </div>
      </div>
      <form onSubmit={save} className="px-6 py-6 space-y-3">
        <label className="block text-xs font-semibold text-[#5a6a82]">Company name
          <span className="relative mt-1 block">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, COMPANY_NAME_MAX))} maxLength={COMPANY_NAME_MAX} disabled={loading}
              placeholder="e.g. Nagaraju Homes" aria-describedby="company-name-count"
              className="w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-[#f8fafc] pl-3 pr-16 text-sm text-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]" />
            {/* Live counter while typing, e.g. 12/15 */}
            <span id="company-name-count" aria-live="polite"
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${name.length >= COMPANY_NAME_MAX ? 'font-bold text-amber-700' : 'font-semibold text-[#8a99ad]'}`}>
              {name.length}/{COMPANY_NAME_MAX}
            </span>
          </span>
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[#8a99ad]">Up to {COMPANY_NAME_MAX} characters, including spaces.</span>
          <button type="submit" disabled={saving || loading || name.trim() === saved}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </form>
    </div>
  )
}
