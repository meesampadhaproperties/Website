'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Mail, Send, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'
import { phoneMatchKey } from '@/lib/lead-phone'
import { PERSONALIZE_HINT, isValidEmail, personalize, smsAppUrl, whatsappChatUrl, type OutreachLead } from '@/lib/outreach'
import { SMS_VALUE_MAX, fillTemplate, templateVariables } from '@/lib/sms'
import { getMessagingSetup, logOutreach, sendEmailToLeads, sendSmsToLeads, type SendSummary } from '@/app/crm/messaging/actions'

export type MessageChannel = 'email' | 'sms' | 'whatsapp'

const WhatsAppGlyph = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.42 9.42 0 1 1 7.99 4.42m8.02-17.44A11.33 11.33 0 0 0 12.04.75C5.8.75.72 5.83.72 12.07c0 2 .52 3.94 1.51 5.65L.62 23.62l6.04-1.58a11.3 11.3 0 0 0 5.38 1.37h.01c6.24 0 11.32-5.08 11.32-11.32 0-3.03-1.18-5.87-3.31-8.01" />
  </svg>
)

/**
 * One composer for Email, SMS and WhatsApp, for one lead or many (REQ-103).
 * - Email: custom subject + message, sent automatically (Resend).
 * - SMS: approved MSG91 template sent automatically, OR custom text opened in the phone's SMS app.
 * - WhatsApp: custom text opened in WhatsApp, one chat at a time (staff press Send).
 * {name} and {project} are filled per lead. Mobile: bottom sheet. Desktop: centered dialog.
 */
export default function MessageComposer({
  leads, initialChannel = 'email', onClose,
}: {
  leads: OutreachLead[]
  initialChannel?: MessageChannel
  onClose: () => void
}) {
  const [channel, setChannel] = useState<MessageChannel>(initialChannel)
  const [setup, setSetup] = useState<{ email: boolean; smsKey: boolean; smsTemplates: { id: string; name: string; body: string }[] } | null>(null)
  const [subject, setSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [smsMode, setSmsMode] = useState<'template' | 'phone'>('template')
  const [templateId, setTemplateId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [customText, setCustomText] = useState('')
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<SendSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getMessagingSetup().then((res) => {
      setSetup(res)
      if (!res.smsKey || res.smsTemplates.length === 0) setSmsMode('phone')
      if (res.smsTemplates.length === 1) pickTemplate(res.smsTemplates[0])
    }).catch(() => setSetup({ email: false, smsKey: false, smsTemplates: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = orig; window.removeEventListener('keydown', onKey) }
  }, [onClose, busy])

  const withEmail = useMemo(() => leads.filter((l) => isValidEmail(l.email)), [leads])
  const withPhone = useMemo(() => leads.filter((l) => phoneMatchKey(l.phone)), [leads])
  const template = setup?.smsTemplates.find((t) => t.id === templateId) || null
  const blanks = templateVariables(template?.body)
  const sample = withPhone[0] || leads[0]

  function pickTemplate(t: { id: string; body: string } | null) {
    setTemplateId(t?.id || '')
    const v: Record<string, string> = {}
    for (const b of templateVariables(t?.body)) {
      const n = b.toLowerCase()
      v[b] = n.includes('project') ? '{project}' : n.includes('name') ? '{name}' : ''
    }
    setValues(v)
  }

  const switchTo = (c: MessageChannel) => { setChannel(c); setSummary(null); setError(''); setOpened(new Set()) }
  const ids = leads.map((l) => l.id)
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

  const run = async (fn: () => Promise<SendSummary | { error: string }>, what: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fn()
      if ('error' in res) { setError(res.error); return }
      setSummary(res)
      if (res.sent) toast.success(`${what} sent to ${plural(res.sent, 'lead')}`)
    } catch {
      setError('Could not send. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Custom text in the staff member's own WhatsApp / SMS app, one lead at a time
  const openFor = (lead: OutreachLead) => {
    const text = personalize(customText, lead)
    const url = channel === 'whatsapp' ? whatsappChatUrl(lead.phone, text) : smsAppUrl(lead.phone, text)
    if (!url) return
    if (channel === 'whatsapp') window.open(url, '_blank', 'noopener,noreferrer')
    else window.location.href = url
    setOpened((prev) => new Set(prev).add(lead.id))
    logOutreach(lead.id, channel === 'whatsapp' ? 'whatsapp' : 'sms_phone', text).catch(() => {})
  }
  const nextLead = withPhone.find((l) => !opened.has(l.id))
  const usingQueue = channel === 'whatsapp' || (channel === 'sms' && smsMode === 'phone')

  const input = 'w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-[#f8fafc] px-3 text-sm text-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]'
  const tab = (c: MessageChannel, label: string, Icon: React.ElementType, count: number) => (
    <button key={c} type="button" role="tab" aria-selected={channel === c} onClick={() => switchTo(c)}
      className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold cursor-pointer ${channel === c ? 'border-[#0f1d33] text-[#0f1d33]' : 'border-transparent text-[#5a6a82] hover:text-[#0f1d33]'}`}>
      <Icon className="h-4 w-4" /> {label}{leads.length > 1 && <span className="text-[11px] font-medium text-[#8a99ad]">({count})</span>}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => !busy && onClose()}>
      <div className="flex w-full sm:max-w-lg max-h-[92vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send message">
        <div className="flex items-center justify-between border-b border-[#e8ecf2] px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#0f1d33]"><Send className="h-5 w-5 shrink-0 text-[#1e3a5f]" /> Send message</h2>
            <p className="truncate text-xs text-[#5a6a82]">
              {leads.length === 1 ? `To ${leads[0].name || leads[0].phone || 'this lead'}` : `To ${leads.length} leads: ${leads.slice(0, 3).map((l) => l.name || l.phone).join(', ')}${leads.length > 3 ? '…' : ''}`}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label="Close"><X className="h-5 w-5 text-[#5a6a82]" /></button>
        </div>

        <div className="flex border-b border-[#e8ecf2] px-2" role="tablist">
          {tab('email', 'Email', Mail, withEmail.length)}
          {tab('sms', 'SMS', Smartphone, withPhone.length)}
          {tab('whatsapp', 'WhatsApp', WhatsAppGlyph, withPhone.length)}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!setup ? (
            <p className="flex items-center gap-2 text-sm text-[#5a6a82]"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>
          ) : summary ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {summary.sent} sent</span>
                {summary.failed > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{summary.failed} not sent</span>}
                {summary.skipped > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{summary.skipped} skipped ({channel === 'email' ? 'no email' : 'no valid mobile'})</span>}
              </div>
              {summary.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-red-700">{summary.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              <p className="text-xs text-[#8a99ad]">Each message is saved in the lead&apos;s history.</p>
              <button type="button" onClick={onClose} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] cursor-pointer">Done</button>
            </div>
          ) : channel === 'email' ? (
            <>
              {!setup.email && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">Email isn&apos;t set up yet: add <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> in Vercel.</p>}
              <label className="block text-xs font-semibold text-[#5a6a82]">Subject
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. Site visit this Sunday, {name}?" className={`${input} mt-1`} />
              </label>
              <label className="block text-xs font-semibold text-[#5a6a82]">Message
                <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={6} maxLength={10000} placeholder={'Hi {name},\n\nThank you for your interest in {project}...'} className={`${input} mt-1 py-2 resize-y`} />
              </label>
              <p className="text-[11px] text-[#8a99ad]">{PERSONALIZE_HINT} Goes to {plural(withEmail.length, 'lead')} with an email{leads.length > withEmail.length ? `; ${leads.length - withEmail.length} without one are skipped` : ''}.</p>
              {error && <p className="text-xs font-semibold text-red-600" role="alert">{error}</p>}
              <button type="button" disabled={busy || !setup.email || !subject.trim() || !emailBody.trim() || withEmail.length === 0}
                onClick={() => run(() => sendEmailToLeads(ids, subject, emailBody), 'Email')}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send email{withEmail.length > 1 ? ` to ${withEmail.length} leads` : ''}
              </button>
            </>
          ) : (
            <>
              {channel === 'sms' && (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f3f5f8] p-1 text-xs font-semibold" role="group" aria-label="SMS type">
                  {(['template', 'phone'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => { setSmsMode(m); setError(''); setOpened(new Set()) }}
                      className={`min-h-[40px] rounded-md px-2 cursor-pointer ${smsMode === m ? 'bg-white text-[#0f1d33] shadow-xs' : 'text-[#5a6a82]'}`}>
                      {m === 'template' ? 'Approved template (automatic)' : 'Custom text (my phone)'}
                    </button>
                  ))}
                </div>
              )}

              {channel === 'sms' && smsMode === 'template' ? (
                !setup.smsKey ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">Automatic SMS isn&apos;t set up yet (MSG91 key). Use &quot;Custom text&quot; meanwhile.</p>
                ) : setup.smsTemplates.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#d0d7e2] p-2.5 text-xs text-[#5a6a82]">No approved templates yet. The Super Admin adds them in Modules → SMS Templates.</p>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-[#5a6a82]">Template
                      <select value={templateId} onChange={(e) => pickTemplate(setup.smsTemplates.find((t) => t.id === e.target.value) || null)} className={`${input} mt-1 cursor-pointer`}>
                        <option value="" disabled>Choose a template</option>
                        {setup.smsTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                    {blanks.map((b) => (
                      <label key={b} className="block text-xs font-semibold text-[#5a6a82]">{b.replace(/_/g, ' ')}
                        <input value={values[b] || ''} onChange={(e) => setValues({ ...values, [b]: e.target.value })} maxLength={SMS_VALUE_MAX + 20} className={`${input} mt-1`} />
                      </label>
                    ))}
                    {template && sample && (
                      <div className="rounded-xl border border-[#e8ecf2] bg-[#f8fafc] p-3">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Preview{leads.length > 1 ? ` (${sample.name || 'first lead'})` : ''}</div>
                        <p className="whitespace-pre-wrap break-words text-sm text-[#0f1d33]">
                          {fillTemplate(template.body, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, personalize(v, sample)])))}
                        </p>
                      </div>
                    )}
                    <p className="text-[11px] text-[#8a99ad]">{PERSONALIZE_HINT} Each blank holds up to {SMS_VALUE_MAX} characters (DLT rule).</p>
                    {error && <p className="text-xs font-semibold text-red-600" role="alert">{error}</p>}
                    <button type="button" disabled={busy || !template || withPhone.length === 0 || blanks.some((b) => !String(values[b] || '').trim())}
                      onClick={() => run(() => sendSmsToLeads(ids, templateId, values), 'SMS')}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send SMS{withPhone.length > 1 ? ` to ${withPhone.length} leads` : ''}
                    </button>
                  </>
                )
              ) : null}

              {usingQueue && (
                <>
                  <label className="block text-xs font-semibold text-[#5a6a82]">Message
                    <textarea value={customText} onChange={(e) => setCustomText(e.target.value)} rows={5} maxLength={2000} placeholder={'Hi {name}, thank you for your interest in {project}...'} className={`${input} mt-1 py-2 resize-y`} />
                  </label>
                  <p className="text-[11px] text-[#8a99ad]">
                    {PERSONALIZE_HINT} Opens {channel === 'whatsapp' ? 'WhatsApp' : "your phone's SMS app"} with the message typed in. You press Send there.
                  </p>
                  {withPhone.length === 0 ? (
                    <p className="text-xs font-semibold text-red-600">No valid mobile number{leads.length > 1 ? 's' : ''}.</p>
                  ) : (
                    <>
                      <button type="button" disabled={!customText.trim() || !nextLead} onClick={() => nextLead && openFor(nextLead)}
                        className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer ${channel === 'whatsapp' ? 'bg-[#1ea952] hover:bg-[#178a43]' : 'bg-[#0f1d33] hover:bg-[#1e3a5f]'}`}>
                        <ExternalLink className="h-4 w-4" />
                        {!nextLead ? 'All opened' : withPhone.length === 1 ? `Open ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS app'}` : `Open next (${opened.size + 1} of ${withPhone.length}): ${nextLead.name || nextLead.phone}`}
                      </button>
                      {withPhone.length > 1 && (
                        <ul className="max-h-44 divide-y divide-[#eef1f6] overflow-y-auto rounded-lg border border-[#e8ecf2]">
                          {withPhone.map((l) => (
                            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                              <span className="min-w-0 truncate text-[#0f1d33]">{l.name || l.phone}</span>
                              {opened.has(l.id)
                                ? <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Opened</span>
                                : <button type="button" disabled={!customText.trim()} onClick={() => openFor(l)} className="min-h-[32px] shrink-0 rounded-md px-2 font-semibold text-[#1e3a5f] hover:bg-[#f3f5f8] disabled:opacity-50 cursor-pointer">Open</button>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {leads.length > withPhone.length && <p className="text-[11px] text-amber-800">{plural(leads.length - withPhone.length, 'lead')} without a valid mobile number skipped.</p>}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
