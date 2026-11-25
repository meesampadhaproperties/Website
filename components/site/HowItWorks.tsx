'use client'

import { useEffect, useRef, useState } from 'react'

type Step = { title: string; text: string }

// Scroll-triggered: a gold line draws through the steps while each marker pops in and its text rises, one after another.
// Content is visible by default (no-JS / reduced motion); the hidden start state is only armed once JS has run.
export function HowItWorks({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLOListElement>(null)
  const [armed, setArmed] = useState(false)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    setArmed(true)
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect() }
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const hidden = armed && !shown
  const step = 0.45 // seconds between steps

  return (
    <ol ref={ref} className="relative mt-12 grid gap-8 lg:grid-cols-4 lg:gap-8">
      {/* Connecting line passes through every marker and runs past the last step: vertical on mobile, horizontal on desktop */}
      <span aria-hidden className={`absolute bottom-0 left-1/2 top-5 w-0.5 -translate-x-1/2 origin-top bg-site-gold/60 transition-transform ease-out lg:hidden ${hidden ? 'scale-y-0' : 'scale-y-100'}`} style={{ transitionDuration: `${(steps.length + 1) * step}s` }} />
      <span aria-hidden className={`absolute inset-x-0 top-5 hidden h-0.5 origin-left bg-site-gold/60 transition-transform ease-out lg:block ${hidden ? 'scale-x-0' : 'scale-x-100'}`} style={{ transitionDuration: `${(steps.length + 1) * step}s` }} />

      {steps.map((s, i) => (
        <li key={s.title} className="relative flex flex-col items-center text-center">
          <span
            className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-site-gold bg-site-panel font-display text-lg font-semibold text-site-gold transition duration-500 ease-out ${hidden ? 'scale-50 opacity-0' : 'scale-100 opacity-100'}`}
            style={{ transitionDelay: `${i * step}s` }}
          >
            {i + 1}
          </span>
          <div
            className={`relative mt-4 bg-site-panel px-2 py-2 transition duration-700 ease-out lg:mt-5 lg:max-w-[16rem] lg:py-0 ${hidden ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
            style={{ transitionDelay: `${i * step + 0.15}s` }}
          >
            <h3 className="font-display text-xl font-semibold text-white">{s.title}</h3>
            <p className="mt-2 text-white/70">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
