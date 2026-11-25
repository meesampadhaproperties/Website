'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Fades and lifts its content in once, when it scrolls into view. Stagger neighbours with `delay` (ms).
 * Content is visible by default (no-JS, reduced motion, or already on screen at load); the hidden start
 * state is only armed for blocks that begin below the fold.
 */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState(false)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    if (el.getBoundingClientRect().top < window.innerHeight) return // already visible: leave as is
    setArmed(true)
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect() }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const hidden = armed && !shown
  return (
    <div
      ref={ref}
      className={`transition duration-700 ease-out ${hidden ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100'} ${className}`}
      style={{ transitionDelay: hidden ? '0ms' : `${delay}ms` }}
    >
      {children}
    </div>
  )
}
