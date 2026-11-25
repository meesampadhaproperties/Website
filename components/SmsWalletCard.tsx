'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Smartphone } from 'lucide-react'
import { getSmsWallet, type SmsWallet } from '@/app/crm/bulk-sender/actions'

const LOW = 100

/** Bulk Sender: SMS credits left + cost per SMS (REQ-106). Styled like the Projects storage meter. */
export function SmsWalletCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [w, setW] = useState<SmsWallet | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setW(await getSmsWallet()) } catch { setW({ configured: false, credits: null, costPerSms: null, error: 'Could not load' }) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (!w) return <div className="h-[58px] w-full animate-pulse rounded-xl border border-[#e8ecf2] bg-white sm:w-72" aria-hidden="true" />

  const credits = w.credits
  const tone = credits === null ? 'text-[#5a6a82]' : credits <= 0 ? 'text-red-600' : credits < LOW ? 'text-amber-600' : 'text-emerald-700'
  const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div className="w-full rounded-xl border border-[#e8ecf2] bg-white px-3 py-2.5 sm:w-72" role="group" aria-label="SMS wallet">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f1d33]"><Smartphone className="h-3.5 w-3.5 text-[#5a6a82]" /> SMS wallet</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`font-semibold ${tone}`}>
            {!w.configured ? 'Not set up' : credits === null ? 'Unavailable' : `${credits.toLocaleString('en-IN')} SMS left`}
          </span>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-6 w-6 items-center justify-center rounded text-[#8a99ad] hover:text-[#0f1d33] cursor-pointer" aria-label="Refresh balance">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </span>
      </div>
      <p className="mt-1 text-[10px] text-[#8a99ad]">
        {w.costPerSms !== null ? `${inr(w.costPerSms)} per SMS` : 'Cost per SMS not set'}
        {w.costPerSms !== null && credits !== null ? ` · balance ≈ ${inr(credits * w.costPerSms)}` : ''}
        {!w.configured ? ' · add MSG91_AUTH_KEY in Vercel' : w.error ? ` · ${w.error}` : ''}
      </p>
    </div>
  )
}
