'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, ImageIcon, Video, X } from 'lucide-react'
import { YouTubeEmbed } from '@/components/site/YouTubeEmbed'
import type { PublicGalleryProject } from '@/lib/website-projects'

const pillBase = 'inline-flex min-h-11 shrink-0 items-center rounded-lg border px-4 text-sm font-semibold whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b87a10]'

type Shot = { id: string; url: string; project: string }
type Tab = 'photos' | 'videos'

/**
 * Public /gallery: a Photos | Videos switch, project filter pills, and everything grouped project by project.
 * Photos open in a full-screen viewer (swipe, arrows, Esc); videos play in place.
 */
export function GalleryGrid({ projects }: { projects: PublicGalleryProject[] }) {
  const photoProjects = projects.filter(p => p.images.length > 0)
  const videoProjects = projects.filter(p => p.videos.length > 0)
  const videoCount = videoProjects.reduce((n, p) => n + p.videos.length, 0)
  const [tab, setTab] = useState<Tab>(photoProjects.length > 0 || videoProjects.length === 0 ? 'photos' : 'videos')
  const [active, setActive] = useState('all')
  const [open, setOpen] = useState<number | null>(null)

  // Opened from a project card's "Explore Project Gallery": /gallery?tab=videos&project=<id> jumps straight to that project
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('tab')
    const pid = q.get('project')
    if (t === 'photos' || t === 'videos') setTab(t)
    if (pid) setActive(pid)
    if (t || pid) requestAnimationFrame(() => document.getElementById('gallery-top')?.scrollIntoView({ block: 'start' }))
  }, [])

  const list = tab === 'photos' ? photoProjects : videoProjects
  // A project that has no photos/videos on this tab disappears from the pills; fall back to "All"
  const current = active !== 'all' && !list.some(p => p.id === active) ? 'all' : active
  const shown = current === 'all' ? list : list.filter(p => p.id === current)
  const shots: Shot[] = shown.flatMap(p => p.images.map(i => ({ id: i.id, url: i.url, project: p.title })))

  useEffect(() => { if (open !== null && open >= shots.length) setOpen(null) }, [open, shots.length])
  const close = useCallback(() => setOpen(null), [])
  const step = useCallback((d: number) => setOpen(i => (i === null || shots.length === 0 ? i : (i + d + shots.length) % shots.length)), [shots.length])

  const tabBtn = (on: boolean) =>
    `inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b87a10] ${on ? 'bg-[#14281d] text-white shadow-sm' : 'text-[#14281d] hover:bg-white'}`

  // Photos are laid out free-form (CSS columns): each picture keeps its own shape, nothing is cropped.
  // Photo number inside the filtered list, so the viewer can open the right picture
  let counter = -1

  return (
    <>
      <div id="gallery-top" className="scroll-mt-20 border-b border-[#e8e2d4] bg-[#fbfaf6]">
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-[#ece6d6] p-1" role="tablist" aria-label="Photos or videos">
            <button type="button" role="tab" aria-selected={tab === 'photos'} onClick={() => setTab('photos')} className={tabBtn(tab === 'photos')}>
              <Camera className="h-4 w-4" aria-hidden /> Photos <span className="text-xs opacity-70">({photoProjects.reduce((n, p) => n + p.images.length, 0)})</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'videos'} onClick={() => setTab('videos')} className={tabBtn(tab === 'videos')}>
              <Video className="h-4 w-4" aria-hidden /> Videos <span className="text-xs opacity-70">({videoCount})</span>
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl overflow-x-auto overscroll-x-contain [scrollbar-color:#e0ac45_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#e0ac45]">
          <div className="mx-auto flex w-max gap-3 px-4 py-4 sm:px-6 lg:px-8" role="group" aria-label="Filter by project">
            {[{ id: 'all', title: 'All projects' }, ...list].map(p => {
              const on = current === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={(e) => { setActive(p.id); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }) }}
                  className={`${pillBase} ${on ? 'border-[#e0ac45] bg-[#e0ac45] text-[#14281d]' : 'border-[#e3d3a8] bg-white text-[#9a6a12] hover:border-[#e0ac45]'}`}
                >
                  {p.title}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-[#f5f2ea]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8" role="tabpanel">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-slate-600">
              {tab === 'photos' ? <ImageIcon className="h-8 w-8" aria-hidden /> : <Video className="h-8 w-8" aria-hidden />}
              {tab === 'photos' ? 'No photos yet.' : 'No videos yet.'}
            </div>
          ) : tab === 'videos' ? (
            // Project by project: a heading, then all of that project's videos (4 per row on desktop, 3 tablet, 2 phone)
            <div className="flex flex-col gap-14">
              {shown.map(p => (
                <section key={p.id} aria-labelledby={`gal-videos-${p.id}`}>
                  <h2 id={`gal-videos-${p.id}`} className="mb-5 text-center font-display text-2xl font-semibold tracking-tight text-[#14281d] sm:text-3xl">{p.title}</h2>
                  <ul className="flex flex-wrap justify-center gap-4" aria-label={`${p.title} videos`}>
                    {p.videos.map((v, i) => (
                      <li key={v.id} className="w-[calc(50%-0.5rem)] min-w-0 sm:w-[calc(33.333%-0.7rem)] lg:w-[calc(25%-0.75rem)]">
                        <div className="overflow-hidden rounded-xl border border-[#e8e2d4] bg-black shadow-[0_1px_3px_rgba(20,40,29,0.08)]">
                          {v.youtube_id ? (
                            <YouTubeEmbed id={v.youtube_id} title={`${p.title} video ${i + 1}`} small />
                          ) : (
                            <video src={v.video_url!} controls playsInline preload="metadata" aria-label={`${p.title} video ${i + 1}`} className="aspect-video w-full bg-black object-contain" />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-14">
              {shown.map(p => (
                <section key={p.id} aria-labelledby={`gal-photos-${p.id}`}>
                  <h2 id={`gal-photos-${p.id}`} className="mb-5 text-center font-display text-2xl font-semibold tracking-tight text-[#14281d] sm:text-3xl">{p.title}</h2>
                  <ul className="columns-2 gap-2.5 sm:columns-3 sm:gap-4 lg:columns-4">
                    {p.images.map(img => {
                      counter += 1
                      const n = counter
                      return (
                        <li key={img.id} className="mb-2.5 break-inside-avoid sm:mb-4">
                          <button
                            type="button"
                            onClick={() => setOpen(n)}
                            className="group block min-h-24 w-full overflow-hidden rounded-xl bg-[#e6e8e2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b87a10]"
                            aria-label={`Open picture ${n + 1} of ${shots.length}: ${p.title}`}
                          >
                            <img src={img.thumb_url} alt={p.title} loading={n < 4 ? 'eager' : 'lazy'} decoding="async" className="block h-auto w-full transition duration-300 group-hover:scale-[1.03]" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {open !== null && shots[open] && <Viewer shots={shots} index={open} onClose={close} onStep={step} />}
    </>
  )
}

function Viewer({ shots, index, onClose, onStep }: { shots: Shot[]; index: number; onClose: () => void; onStep: (d: number) => void }) {
  const shot = shots[index]
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onStep(-1)
      else if (e.key === 'ArrowRight') onStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey) }
  }, [onClose, onStep])

  const navBtn = 'absolute top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`${shot.project} picture ${index + 1} of ${shots.length}`}
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1)
      }}
    >
      <button ref={closeRef} type="button" onClick={onClose} className="absolute right-3 top-3 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label="Close">
        <X className="h-6 w-6" aria-hidden />
      </button>
      {shots.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onStep(-1) }} className={`${navBtn} left-2 sm:left-4`} aria-label="Previous picture"><ChevronLeft className="h-6 w-6" aria-hidden /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onStep(1) }} className={`${navBtn} right-2 sm:right-4`} aria-label="Next picture"><ChevronRight className="h-6 w-6" aria-hidden /></button>
        </>
      )}
      <figure className="flex max-h-full w-full flex-col items-center px-3 py-16 sm:px-20" onClick={(e) => e.stopPropagation()}>
        <img src={shot.url} alt={shot.project} decoding="async" className="max-h-[78dvh] max-w-full rounded-lg object-contain" />
        <figcaption className="mt-3 text-center text-sm text-white/85">{shot.project} · {index + 1} / {shots.length}</figcaption>
      </figure>
    </div>
  )
}
