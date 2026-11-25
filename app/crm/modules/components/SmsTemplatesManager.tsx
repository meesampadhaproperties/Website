'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { FormImportSwitch } from '@/components/FormImportSwitch'
import { templateVariables } from '@/lib/sms'
import { deleteSmsTemplate, getSmsTemplatesAdmin, saveSmsTemplate, setSmsTemplateActive, type SmsTemplate } from '../sms-actions'

const EMPTY = { id: '', name: '', msg91_template_id: '', body: '' }

/**
 * Modules → SMS Templates (MSG91), Super Admin only (REQ-99).
 * Each template must be DLT-approved and created in MSG91 first; paste its ID and text here.
 * Blanks are written as ##name##, exactly as in the MSG91 template.
 */
export default function SmsTemplatesManager() {
  const [templates, setTemplates] = useState<SmsTemplate[] | null>(null)
  const [keyConfigured, setKeyConfigured] = useState(true)
  const [form, setForm] = useState<typeof EMPTY | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    getSmsTemplatesAdmin().then((res) => {
      setTemplates(res.templates)
      setKeyConfigured(res.keyConfigured)
      if (res.error) toast.error('Could not load SMS templates', { description: res.error })
    })
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    const res = await saveSmsTemplate({ id: form.id || undefined, name: form.name, msg91_template_id: form.msg91_template_id, body: form.body })
    setSaving(false)
    if (!res.success || !res.template) { toast.error(res.error || 'Could not save'); return }
    setTemplates((ts) => {
      const list = ts || []
      return list.some((t) => t.id === res.template!.id) ? list.map((t) => (t.id === res.template!.id ? res.template! : t)) : [...list, res.template!]
    })
    toast.success('SMS template saved')
    setForm(null)
  }

  const toggle = async (t: SmsTemplate) => {
    setBusyId(t.id)
    const res = await setSmsTemplateActive(t.id, !t.is_active)
    setBusyId(null)
    if (!res.success) { toast.error(res.error || 'Could not update'); return }
    setTemplates((ts) => (ts || []).map((x) => (x.id === t.id ? { ...x, is_active: !t.is_active } : x)))
  }

  const remove = async (t: SmsTemplate) => {
    if (!window.confirm(`Delete the SMS template "${t.name}"?`)) return
    setBusyId(t.id)
    const res = await deleteSmsTemplate(t.id)
    setBusyId(null)
    if (!res.success) { toast.error(res.error || 'Could not delete'); return }
    setTemplates((ts) => (ts || []).filter((x) => x.id !== t.id))
    toast.success('SMS template deleted')
  }

  const input = 'w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-white px-3 text-sm text-[#0f1d33] outline-none focus:border-[#0f1d33]'

  return (
    <div className="rounded-xl border border-[#e8ecf2] bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#0f1d33]">
            <MessageSquareText className="h-5 w-5 text-sky-600" /> SMS Templates (MSG91)
          </h3>
          <p className="mt-1 text-xs text-[#5a6a82]">
            Templates staff can send from the Inbox. Each one must be DLT-approved and added in MSG91 first.
            Write each blank as <code>##name##</code>, exactly as in MSG91.
          </p>
        </div>
        {!form && (
          <button
            type="button"
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0f1d33] px-3 text-sm font-semibold text-white hover:bg-[#1e3a5f] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add template
          </button>
        )}
      </div>

      {!keyConfigured && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          MSG91 isn&apos;t connected on this deployment yet: add <code>MSG91_AUTH_KEY</code> in Vercel. Templates can be prepared meanwhile.
        </p>
      )}

      {form && (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3 rounded-xl border border-[#e8ecf2] bg-[#f8fafc] p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#5a6a82]">Name (for your team)
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Site visit reminder" required maxLength={80} className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-[#5a6a82]">MSG91 template ID
              <input value={form.msg91_template_id} onChange={(e) => setForm({ ...form, msg91_template_id: e.target.value })} placeholder="from MSG91 → SMS → Templates" required className={`${input} mt-1 font-mono`} />
            </label>
          </div>
          <label className="text-xs font-semibold text-[#5a6a82]">Template text (exactly as approved)
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} required maxLength={1000}
              placeholder="e.g. Dear ##name##, thank you for your interest in ##project##. Call us to book a site visit. - COMPANY"
              className={`${input} mt-1 py-2 resize-y`} />
          </label>
          {templateVariables(form.body).length > 0 && (
            <p className="text-xs text-[#5a6a82]">Blanks staff will fill: {templateVariables(form.body).map((v) => <code key={v} className="mx-0.5 rounded bg-white px-1">{v}</code>)}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-medium text-[#5a6a82] hover:bg-white cursor-pointer">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save template
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {templates === null ? (
          <p className="flex items-center gap-2 text-sm text-[#5a6a82]"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>
        ) : templates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d0d7e2] p-3 text-center text-sm text-[#5a6a82]">No SMS templates yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 rounded-xl border border-[#e8ecf2] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#0f1d33]">{t.name}</span>
                    <span className="font-mono text-[11px] text-[#8a99ad]">ID: {t.msg91_template_id}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 break-words text-xs text-[#5a6a82]">{t.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <FormImportSwitch on={t.is_active} disabled={busyId === t.id} onToggle={() => toggle(t)} onTitle="Available in the Inbox. Click to hide." offTitle="Hidden from the Inbox. Click to make available." />
                  <button type="button" onClick={() => setForm({ id: t.id, name: t.name, msg91_template_id: t.msg91_template_id, body: t.body })}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5a6a82] hover:bg-[#f3f5f8] hover:text-[#0f1d33] cursor-pointer" title="Edit" aria-label="Edit template">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove(t)} disabled={busyId === t.id}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 cursor-pointer" title="Delete" aria-label="Delete template">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
