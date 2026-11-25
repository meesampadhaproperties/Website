'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { EnquiryForm } from './EnquiryForm'

const SHOW_AFTER_MS = 3200   // splash screen ends at ~1.7s, then a short breather
const DONE_KEY = 'ms-enquiry-sent'
const SEARCH_ENGINE = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia)\./i

// Enquiry pop-up: opens a moment after the splash on every full page load/refresh. Closeable with X, Esc or a click outside.
// Not shown on /enquiry (the form is already the page), to visitors arriving from a search engine, or again in the same tab after a successful enquiry.
export function EnquiryPopup() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const shownOnce = useRef(false)

  useEffect(() => {
    if (shownOnce.current || pathname === '/enquiry') return
    try { if (sessionStorage.getItem(DONE_KEY)) return } catch {}
    // Google penalises pop-ups shown to people landing from search results, so skip them for those visitors.
    try { if (document.referrer && SEARCH_ENGINE.test(new URL(document.referrer).hostname)) return } catch {}
    const t = setTimeout(() => { shownOnce.current = true; setOpen(true) }, SHOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [pathname])

  const close = useCallback(() => setOpen(false), [])
  const onSuccess = useCallback(() => { try { sessionStorage.setItem(DONE_KEY, '1') } catch {} }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open, close])

  if (!open) return null
  return (
    <div className="popup-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="popup-title" tabIndex={-1}
        className="popup-card relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t-4 border-site-gold bg-site-ink p-5 text-white shadow-2xl outline-none sm:rounded-3xl sm:border-4 sm:p-7">
        <button type="button" onClick={close} aria-label="Close enquiry form"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-site-gold">
          <X className="h-6 w-6" aria-hidden />
        </button>
        <h2 id="popup-title" className="pr-10 font-display text-2xl font-semibold tracking-tight">Looking for a property?</h2>
        <p className="mb-5 mt-2 text-white/70">Leave your details and an agent will contact you.</p>
        <EnquiryForm onSuccess={onSuccess} />
      </div>
    </div>
  )
}
