'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Loader2, Lock, Mail, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormImportSwitch } from '@/components/FormImportSwitch'
import { COMPANY_NAME } from '@/lib/site-config'
import { DEFAULT_WELCOME_EMAIL, WELCOME_LIMITS, renderWelcomeEmail, type WelcomeEmailConfig } from '@/lib/welcome-email'
import { getWelcomeEmailAdmin, saveWelcomeEmail, sendWelcomeTest, uploadWelcomeLogo } from '../welcome-email-actions'

/**
 * Modules → Email Template. The welcome email sent automatically to each NEW lead (the customer only, never staff).
 * The From address is fixed (set in Vercel), shown here read-only.
 */
export default function EmailTemplate() {
  const [cfg, setCfg] = useState<WelcomeEmailConfig>(DEFAULT_WELCOME_EMAIL)
  const [from, setFrom] = useState('')
  const [emailReady, setEmailReady] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getWelcomeEmailAdmin().then((r) => {
      setCfg(r.config); setFrom(r.from.display); setEmailReady(r.emailReady); setLoaded(true)
      if (r.error) toast.error('Could not load the email template', { description: r.error })
    })
  }, [])

  const set = <K extends keyof WelcomeEmailConfig>(k: K, v: WelcomeEmailConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const preview = useMemo(() => renderWelcomeEmail(cfg, { name: 'Ravi Kumar', project: 'Sample Project' }, COMPANY_NAME), [cfg])

  const save = async (next: WelcomeEmailConfig = cfg) => {
    setSaving(true)
    const res = await saveWelcomeEmail(next)
    setSaving(false)
    if (!res.success || !res.config) { toast.error(res.error || 'Could not save'); return false }
    setCfg(res.config)
    toast.success('Email template saved')
    return true
  }

  const toggle = async () => {
    const next = { ...cfg, enabled: !cfg.enabled }
    setCfg(next)
    if (!(await save(next))) setCfg(cfg)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await uploadWelcomeLogo(fd)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!res.success || !res.url) { toast.error(res.error || 'Upload failed'); return }
    set('logoUrl', res.url)
    toast.success('Logo added. Press Save to keep it.')
  }

  const test = async () => {
    setTesting(true)
    const res = await sendWelcomeTest(cfg, testTo)
    setTesting(false)
    if (!res.success) { toast.error(res.error || 'Could not send the test'); return }
    toast.success(`Test sent to ${testTo.trim()}`)
  }

  const input = 'w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-white px-3 text-sm text-[#0f1d33] outline-none focus:border-[#0f1d33]'
  const label = 'text-xs font-semibold text-[#0f1d33]'

  return (
    <div className="rounded-xl border border-[#e8ecf2] bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#0f1d33]">
            <Mail className="h-5 w-5 text-emerald-600" /> Email Template (Welcome email)
          </h3>
          <p className="mt-1 text-xs text-[#5a6a82]">
            Sent automatically to each new customer who has an email address. It goes to the customer only, never to staff.
            Use <code>{'{name}'}</code> for their first name and <code>{'{project}'}</code> for their project.
          </p>
        </div>
        <FormImportSwitch on={cfg.enabled} onToggle={toggle} disabled={!loaded || saving}
          onTitle="Welcome email is ON for new leads. Click to turn off." offTitle="Welcome email is OFF. Click to turn on." />
      </div>

      {!emailReady && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          Email isn&apos;t set up yet: add <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> in Vercel before turning this on.
        </p>
      )}

      {!loaded ? (
        <div className="mt-6 flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#5a6a82]" /></div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-3">
            <div>
              <label className={label}>From (fixed)</label>
              <div className="mt-1 flex min-h-[44px] items-center gap-2 rounded-lg border border-[#e8ecf2] bg-[#f8fafc] px-3 text-sm text-[#5a6a82]">
                <Lock className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate" title={from}>{from || 'Not set (RESEND_FROM_EMAIL in Vercel)'}</span>
              </div>
              <p className="mt-1 text-[11px] text-[#5a6a82]">Customers see this sender. It is set in Vercel and can&apos;t be changed here.</p>
            </div>

            <div>
              <label className={label}>Logo (PNG or JPEG, up to 2 MB)</label>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {cfg.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={cfg.logoUrl} alt="Logo" className="h-12 max-w-[160px] rounded border border-[#e8ecf2] bg-slate-100 object-contain p-1" />
                  : <span className="text-xs text-[#5a6a82]">No logo: the company name is shown instead.</span>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#e8ecf2] px-3 text-sm font-semibold text-[#0f1d33] cursor-pointer hover:bg-[#f8fafc] disabled:opacity-60">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {cfg.logoUrl ? 'Replace' : 'Upload'}
                </button>
                {cfg.logoUrl && (
                  <button type="button" onClick={() => set('logoUrl', '')} className="inline-flex min-h-[44px] items-center gap-1 px-2 text-sm font-semibold text-rose-600 cursor-pointer">
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={label}>Subject</label>
              <input value={cfg.subject} onChange={(e) => set('subject', e.target.value)} maxLength={WELCOME_LIMITS.subject} className={`${input} mt-1`} />
            </div>
            <div>
              <label className={label}>Heading</label>
              <input value={cfg.heading} onChange={(e) => set('heading', e.target.value)} maxLength={WELCOME_LIMITS.heading} className={`${input} mt-1`} />
            </div>
            <div>
              <label className={label}>Message</label>
              <textarea value={cfg.body} onChange={(e) => set('body', e.target.value)} rows={7} maxLength={WELCOME_LIMITS.body} className={`${input} mt-1 resize-y py-2`} />
            </div>
            <div>
              <label className={label}>Sign-off</label>
              <textarea value={cfg.footer} onChange={(e) => set('footer', e.target.value)} rows={2} maxLength={WELCOME_LIMITS.footer} className={`${input} mt-1 resize-y py-2`} />
            </div>
            <div>
              <label className={label}>Brand colour</label>
              <div className="mt-1 flex items-center gap-3">
                <input type="color" value={cfg.brandColor} onChange={(e) => set('brandColor', e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-[#e8ecf2] bg-white p-1" aria-label="Brand colour" />
                <span className="text-xs text-[#5a6a82]">{cfg.brandColor}</span>
              </div>
            </div>

            <button type="submit" disabled={saving}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white cursor-pointer hover:bg-[#1e3a5f] disabled:opacity-60 sm:w-auto">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save template
            </button>

            <div className="border-t border-[#e8ecf2] pt-3">
              <label className={label}>Send a test (uses what&apos;s on screen, saved or not)</label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="your@email.com" className={input} />
                <button type="button" onClick={test} disabled={testing || !testTo.trim()}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg border border-[#e8ecf2] px-4 text-sm font-semibold text-[#0f1d33] cursor-pointer hover:bg-[#f8fafc] disabled:opacity-60">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
                </button>
              </div>
            </div>
          </form>

          <div className="min-w-0">
            <p className={label}>Preview (as the customer sees it)</p>
            <div className="mt-1 rounded-lg border border-[#e8ecf2] bg-[#f8fafc] p-2 text-[11px] text-[#5a6a82]">
              <div className="truncate"><b>From:</b> {from || '—'}</div>
              <div className="truncate"><b>Subject:</b> {preview.subject}</div>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="mt-2 h-[520px] w-full rounded-lg border border-[#e8ecf2] bg-white" />
          </div>
        </div>
      )}
    </div>
  )
}
