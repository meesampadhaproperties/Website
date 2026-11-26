'use client'

import { MessageSquareText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { SMS_DISABLED_MESSAGE } from '@/lib/sms'

/** Modules → SMS Templates (MSG91) while SMS is switched off (SMS_ENABLED in lib/sms.ts). Saved templates are kept untouched. */
export default function SmsTemplatesDisabled() {
  return (
    <div className="rounded-xl border border-[#e8ecf2] bg-white p-4 sm:p-5 shadow-xs" role="group" aria-label="SMS Templates (MSG91)">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-[#0f1d33]">
            <MessageSquareText className="h-5 w-5 text-[#8a99ad]" /> SMS Templates (MSG91)
            <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">Disabled</span>
          </h3>
          <p className="mt-1 text-xs text-[#5a6a82]">{SMS_DISABLED_MESSAGE} Your saved templates are kept and will be back when SMS is turned on.</p>
        </div>
        <button
          type="button"
          onClick={() => toast.info(SMS_DISABLED_MESSAGE)}
          aria-disabled="true"
          title={SMS_DISABLED_MESSAGE}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 text-sm font-semibold text-[#8a99ad] cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add template
        </button>
      </div>
    </div>
  )
}
