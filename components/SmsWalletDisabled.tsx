import { Smartphone } from 'lucide-react'
import { SMS_DISABLED_MESSAGE } from '@/lib/sms'

/** Bulk Sender wallet slot while SMS is switched off (SMS_ENABLED in lib/sms.ts). No balance is fetched. */
export function SmsWalletDisabled() {
  return (
    <div className="w-full rounded-xl border border-[#e8ecf2] bg-white px-3 py-2.5 sm:w-72" role="group" aria-label="SMS wallet">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f1d33]"><Smartphone className="h-3.5 w-3.5 text-[#5a6a82]" /> SMS wallet</span>
        <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">Disabled</span>
      </div>
      <p className="mt-1 text-[10px] text-[#8a99ad]">{SMS_DISABLED_MESSAGE}</p>
    </div>
  )
}
