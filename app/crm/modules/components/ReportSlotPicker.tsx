'use client'

import { REPORT_SLOTS, masterTimesFor, slotLabel, toggleSlot } from '@/lib/reports/slots'

/**
 * Report times for one recipient: the six fixed slots, and below them the slots that ALSO carry the
 * master report (every lead so far). A master tick is only possible on a slot the person receives.
 */
export default function ReportSlotPicker({ times, onTimes, master, onMaster, tone = 'navy' }: {
  times: string[]
  onTimes: (t: string[]) => void
  master: string[]
  onMaster: (m: string[]) => void
  tone?: 'navy' | 'green'
}) {
  const on = tone === 'green' ? 'bg-green-600 text-white border-green-600 font-semibold shadow-sm' : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
  const off = 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
  const masterOn = 'bg-amber-500 text-white border-amber-500 font-semibold shadow-sm'
  const setTimes = (slot: string) => {
    const next = toggleSlot(times, slot)
    onTimes(next)
    onMaster(masterTimesFor(next, master)) // un-ticking a slot also removes its master tick
  }
  const setMaster = (slot: string) => onMaster(masterTimesFor(times, toggleSlot(master, slot)))

  return (
    <div className="mt-2.5 space-y-2.5">
      <div>
        <label className="block text-[11px] font-semibold text-[#5a6a82] mb-1">
          Report times <span className="text-[10px] text-gray-400 font-normal">(each report covers the time since the previous slot)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {REPORT_SLOTS.map((slot) => (
            <button key={slot} type="button" aria-pressed={times.includes(slot)} onClick={() => setTimes(slot)}
              className={`min-h-[36px] px-3 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${times.includes(slot) ? on : off}`}>
              {slotLabel(slot)}
            </button>
          ))}
        </div>
        {times.length === 0 && <p className="mt-1 text-[10px] text-amber-700">No time picked: this person gets the 9 AM and 6 PM reports.</p>}
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-[#5a6a82] mb-1">
          Master report <span className="text-[10px] text-gray-400 font-normal">(all leads till date, added at these times)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {REPORT_SLOTS.map((slot) => {
            const allowed = times.includes(slot)
            return (
              <button key={slot} type="button" disabled={!allowed} aria-pressed={master.includes(slot)} onClick={() => setMaster(slot)}
                title={allowed ? undefined : 'Pick this report time first'}
                className={`min-h-[36px] px-3 py-1 text-xs rounded-lg border transition-colors ${master.includes(slot) ? masterOn : off} ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                {slotLabel(slot)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
