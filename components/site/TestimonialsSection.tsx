'use client'

import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { YouTubeEmbed } from '@/components/site/YouTubeEmbed'
import type { PublicTestimonial } from '@/lib/website-projects'

/** Up to this many testimonials sit still, side by side; more than this and the row starts sliding. */
const STATIC_MAX = 4
/** Seconds each card takes to pass: very slow (about 15 pixels a second). */
const SECONDS_PER_CARD = 20

// 4 cards across on desktop, 3 on tablets, 2 on phones; the width follows the row's own width (cqw), so it always fits.
const cardWidth = { width: 'calc((100cqw - (var(--n) - 1) * 1rem) / var(--n))' }
const rowVars = 'w-full [container-type:inline-size] [--n:2] sm:[--n:3] lg:[--n:4]'

/** Module-level on purpose: a component declared inside another is re-created every render, which would reset a playing video. */
function TestimonialCard({ t, clone, onPlay }: { t: PublicTestimonial; clone: boolean; onPlay: () => void }) {
  return (
    <li className="shrink-0" style={cardWidth}>
      <div className="overflow-hidden rounded-xl border border-[#e0d8c4] bg-black shadow-[0_1px_3px_rgba(20,40,29,0.1)]">
        {t.youtube_id ? (
          <YouTubeEmbed id={t.youtube_id} title={`${t.title} testimonial`} small tabbable={!clone} onPlay={onPlay} />
        ) : (
          <video src={t.video_url!} controls playsInline preload="metadata" tabIndex={clone ? -1 : 0} aria-label={`${t.title} testimonial`} onPlay={onPlay} className="aspect-video w-full bg-black object-contain" />
        )}
      </div>
      <p className="mt-2 line-clamp-2 px-1 text-center text-sm font-semibold leading-snug text-site-ink">{t.title}</p>
    </li>
  )
}

/** Home page: customer video testimonials in a single, very slowly sliding row (4 across). */
export function TestimonialsSection({ testimonials }: { testimonials: PublicTestimonial[] }) {
  const [paused, setPaused] = useState(false)
  if (testimonials.length === 0) return null

  const moving = testimonials.length > STATIC_MAX
  const seconds = Math.max(60, testimonials.length * SECONDS_PER_CARD)

  return (
    <section className="bg-[#f5f1e8]" aria-labelledby="testimonials">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <h2 id="testimonials" className="text-center font-display text-3xl font-semibold tracking-tight text-site-ink sm:text-4xl">Testimonials</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-700">Hear from people who bought with Mee Sampadha.</p>

        {moving && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setPaused(p => !p)}
              aria-pressed={paused}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9c99a] bg-white px-4 text-sm font-semibold text-[#8a5d0c] hover:border-site-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-gold motion-reduce:hidden"
            >
              {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              {paused ? 'Play scrolling' : 'Pause scrolling'}
            </button>
          </div>
        )}

        {moving ? (
          <div className={`marquee mt-6 overflow-hidden motion-reduce:overflow-x-auto ${rowVars}`} style={{ ['--marquee-duration' as string]: `${seconds}s` }}>
            <div className="marquee-track flex w-max" data-paused={paused ? 'true' : 'false'}>
              <ul className="flex shrink-0 gap-4 pr-4" aria-label="Customer testimonials">
                {testimonials.map(t => <TestimonialCard key={`a-${t.id}`} t={t} clone={false} onPlay={() => setPaused(true)} />)}
              </ul>
              {/* Identical second set for the seamless loop: hidden from screen readers and the keyboard */}
              <ul className="flex shrink-0 gap-4 pr-4 motion-reduce:hidden" aria-hidden="true">
                {testimonials.map(t => <TestimonialCard key={`b-${t.id}`} t={t} clone onPlay={() => setPaused(true)} />)}
              </ul>
            </div>
          </div>
        ) : (
          <ul className={`mt-8 flex flex-wrap justify-center gap-4 ${rowVars}`} aria-label="Customer testimonials">
            {testimonials.map(t => <TestimonialCard key={t.id} t={t} clone={false} onPlay={() => {}} />)}
          </ul>
        )}
      </div>
    </section>
  )
}
