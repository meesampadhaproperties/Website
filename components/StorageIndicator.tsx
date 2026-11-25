'use client'

import { useCallback, useEffect, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { getStorageUsage } from '@/app/crm/projects/actions'

function fmt(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Live storage indicator. Refreshes when `refreshKey` changes (after uploads/deletes),
 * when the tab regains focus, and every 60 seconds.
 */
export function StorageIndicator({ refreshKey = 0 }: { refreshKey?: number }) {
  const [usage, setUsage] = useState<{ used: number; limit: number; files: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await getStorageUsage()
      if (res.success) setUsage({ used: res.usedBytes || 0, limit: res.limitBytes || 1, files: res.fileCount || 0 })
    } catch {}
  }, [])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const t = setInterval(load, 60_000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [load])

  if (!usage) {
    return <div className="h-[58px] w-full animate-pulse rounded-xl border border-[#e8ecf2] bg-white sm:w-72" aria-hidden="true" />
  }

  const pct = Math.min(100, (usage.used / usage.limit) * 100)
  const left = Math.max(0, usage.limit - usage.used)
  const tone = pct >= 90 ? { bar: 'bg-red-500', text: 'text-red-600' } : pct >= 70 ? { bar: 'bg-amber-500', text: 'text-amber-600' } : { bar: 'bg-emerald-500', text: 'text-emerald-700' }

  return (
    <div className="w-full rounded-xl border border-[#e8ecf2] bg-white px-3 py-2.5 sm:w-72" role="group" aria-label="Storage usage">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f1d33]"><HardDrive className="h-3.5 w-3.5 text-[#5a6a82]" /> Storage</span>
        <span className={`font-semibold ${tone.text}`}>{fmt(left)} left</span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#eef1f5]"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
        aria-label={`${pct.toFixed(0)}% of storage used`}
      >
        <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${Math.max(pct, usage.used > 0 ? 1 : 0)}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-[#8a99ad]">
        {fmt(usage.used)} of {fmt(usage.limit)} used · {usage.files} file{usage.files === 1 ? '' : 's'}
      </p>
    </div>
  )
}
