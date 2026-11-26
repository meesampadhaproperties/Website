'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps an open page in sync with the CRM (REQ-109): re-fetches the server-rendered data when the
 * visitor returns to the tab (after at least a minute away) and every `intervalMs` (5 minutes, the same as the
 * page cache) while it is visible. Client state (a playing
 * video, the chosen category pill) is kept, because router.refresh() only swaps server data.
 */
export function AutoRefresh({ intervalMs = 300_000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    let last = Date.now()
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return
      last = Date.now()
      router.refresh()
    }
    const timer = window.setInterval(refresh, intervalMs)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [router, intervalMs])
  return null
}
