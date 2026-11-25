'use client'

import { useActionState, useEffect, useId, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { cleanPhoneInput, phoneShapeError } from '@/lib/phone-shape'
import { submitEnquiry, type EnquiryState } from './enquiry-action'

const field = 'mt-1.5 block w-full rounded-xl border border-white/20 bg-white/5 px-4 text-base text-white placeholder:text-white/40 focus:border-site-gold focus:outline-none focus:ring-2 focus:ring-site-gold/40 aria-[invalid=true]:border-red-400'
const label = 'text-sm font-medium text-white/90'
const err = 'mt-1 text-sm text-red-300'

export function EnquiryForm({ onSuccess }: { onSuccess?: () => void }) {
  const pathname = usePathname()
  const uid = useId().replace(/:/g, '')
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiry, { ok: false })
  const [phone, setPhone] = useState('')
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null)
  const [ref, setRef] = useState('')
  useEffect(() => { if (state.ok) onSuccess?.() }, [state.ok, onSuccess])
  // Campaign tag from the link, e.g. /enquiry?ref=instagram
  useEffect(() => { const q = new URLSearchParams(window.location.search); setRef((q.get('ref') || q.get('utm_source') || '').slice(0, 60)) }, [])

  if (state.ok) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-site-green/40 bg-site-green/10 p-4 text-white">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-site-green" aria-hidden />
        <p className="text-lg">{state.message}</p>
      </div>
    )
  }

  const e = state.errors || {}
  const phoneError = phoneMsg || e.phone

  return (
    <form action={action} noValidate className="space-y-3.5" aria-describedby={state.message ? `${uid}-error` : undefined}>
      <input type="hidden" name="page" value={pathname} />
      <input type="hidden" name="ref" value={ref} />
      {/* Honeypot for bots; hidden from people and screen readers */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div>
        <label htmlFor={`${uid}-name`} className={label}>Name <span className="text-site-gold" aria-hidden>*</span></label>
        <input id={`${uid}-name`} name="name" type="text" autoComplete="name" required maxLength={60} placeholder="Your full name"
          defaultValue={state.values?.name} aria-invalid={!!e.name} aria-describedby={e.name ? `${uid}-name-err` : undefined}
          className={`${field} h-11`} />
        {e.name && <p id={`${uid}-name-err`} className={err}>{e.name}</p>}
      </div>

      <div>
        <label htmlFor={`${uid}-phone`} className={label}>Mobile number <span className="text-site-gold" aria-hidden>*</span> <span className="font-normal text-white/60">(required)</span></label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 mt-1 -translate-y-1/2 text-base text-white/60">+91</span>
          <input id={`${uid}-phone`} name="phone" type="tel" aria-required="true" inputMode="numeric" autoComplete="tel-national" required maxLength={10}
            placeholder="10-digit mobile number" value={phone}
            onChange={(ev) => { const v = cleanPhoneInput(ev.target.value); setPhone(v); if (phoneMsg && v.length === 10 && !phoneShapeError(v)) setPhoneMsg(null) }}
            onBlur={() => setPhoneMsg(phone ? phoneShapeError(phone) : null)}
            aria-invalid={!!phoneError} aria-describedby={phoneError ? `${uid}-phone-err` : undefined}
            className={`${field} h-11 pl-14`} />
        </div>
        {phoneError && <p id={`${uid}-phone-err`} className={err}>{phoneError}</p>}
      </div>

      <div>
        <label htmlFor={`${uid}-message`} className={label}>Message <span className="text-site-gold" aria-hidden>*</span></label>
        <textarea id={`${uid}-message`} name="message" required rows={3} maxLength={500} placeholder="What are you looking for? Budget, area, property type..."
          defaultValue={state.values?.message} aria-invalid={!!e.message} aria-describedby={e.message ? `${uid}-message-err` : undefined}
          className={`${field} py-3`} />
        {e.message && <p id={`${uid}-message-err`} className={err}>{e.message}</p>}
      </div>

      {state.message && <p id={`${uid}-error`} role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm text-red-200">{state.message}</p>}

      <button type="submit" disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-site-gold px-6 text-base font-semibold text-site-ink transition hover:brightness-110 disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto">
        {pending ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Sending...</>) : 'Send enquiry'}
      </button>
    </form>
  )
}
