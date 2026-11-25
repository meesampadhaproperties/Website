'use client'

import { useEffect, useState } from 'react'
import { Check, ListChecks, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { addEnquiryType, deleteEnquiryType, getEnquiryTypesAdmin, renameEnquiryType, type EnquiryType } from '../enquiry-type-actions'

/** Modules → Enquiry Types (REQ-105): the options in the lead form's Enquiry Type dropdown and the Excel import. */
export default function EnquiryTypeManager() {
  const [types, setTypes] = useState<EnquiryType[] | null>(null)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { getEnquiryTypesAdmin().then((r) => { setTypes(r.data); if (r.error) toast.error(r.error) }) }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('new')
    const res = await addEnquiryType(newName)
    setBusy(null)
    if (!res.success || !res.data) { toast.error(res.error || 'Could not add'); return }
    setTypes((t) => [...(t || []), res.data!])
    setNewName('')
    toast.success('Enquiry type added')
  }
  const save = async () => {
    if (!editing) return
    setBusy(editing.id)
    const res = await renameEnquiryType(editing.id, editing.name)
    setBusy(null)
    if (!res.success) { toast.error(res.error || 'Could not rename'); return }
    setTypes((t) => (t || []).map((x) => (x.id === editing.id ? { ...x, name: editing.name.trim() } : x)))
    setEditing(null)
    toast.success('Renamed. Leads with this type were updated too.')
  }
  const remove = async (t: EnquiryType) => {
    if (!window.confirm(`Delete "${t.name}"? Leads that have it keep it until someone changes it.`)) return
    setBusy(t.id)
    const res = await deleteEnquiryType(t.id)
    setBusy(null)
    if (!res.success) { toast.error(res.error || 'Could not delete'); return }
    setTypes((x) => (x || []).filter((y) => y.id !== t.id))
  }

  const input = 'min-h-[40px] w-full rounded-lg border border-[#e8ecf2] bg-white px-3 text-sm text-[#0f1d33] outline-none focus:border-[#0f1d33]'
  return (
    <div className="rounded-xl border border-[#e8ecf2] bg-white p-4 sm:p-5 shadow-xs">
      <h3 className="flex items-center gap-2 text-base font-bold text-[#0f1d33]"><ListChecks className="h-5 w-5 text-[#1e3a5f]" /> Enquiry Types</h3>
      <p className="mt-1 text-xs text-[#5a6a82]">The choices in the lead form&apos;s Enquiry Type dropdown and in the Excel import template.</p>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="e.g. Home loan" className={input} />
        <button type="submit" disabled={!newName.trim() || busy === 'new'} className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-[#0f1d33] px-3 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer">
          {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </form>
      <ul className="mt-3 divide-y divide-[#eef1f6] rounded-lg border border-[#e8ecf2]">
        {types === null ? <li className="p-3 text-sm text-[#5a6a82]">Loading...</li>
          : types.length === 0 ? <li className="p-3 text-sm text-[#5a6a82]">No types yet. The defaults are used until you add one.</li>
          : types.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-1.5">
              {editing?.id === t.id ? (
                <>
                  <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={40} className={input}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null) }} />
                  <button type="button" onClick={save} disabled={busy === t.id} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer" aria-label="Save"><Check className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setEditing(null)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#5a6a82] hover:bg-[#f3f5f8] cursor-pointer" aria-label="Cancel"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-[#0f1d33]">{t.name}</span>
                  <button type="button" onClick={() => setEditing({ id: t.id, name: t.name })} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#5a6a82] hover:bg-[#f3f5f8] cursor-pointer" aria-label={`Rename ${t.name}`}><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => remove(t)} disabled={busy === t.id} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 cursor-pointer" aria-label={`Delete ${t.name}`}><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
      </ul>
    </div>
  )
}
