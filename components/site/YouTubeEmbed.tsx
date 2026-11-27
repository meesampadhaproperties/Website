'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Play, X } from 'lucide-react'
import { youtubeEmbedUrl, youtubeThumbUrl, youtubeWatchUrl } from '@/lib/youtube'
import { isYouTubeKey, videoEmbedUrl, videoKind, videoLabel, videoOpenUrl } from '@/lib/video-link'

interface EmbedProps {
  /** A video key: a YouTube id, or a link from any other site (Instagram, Facebook, Vimeo, an .mp4 link, any page) */
  id: string; title: string; fill?: boolean; className?: string
  /** Compact card (gallery, home): smaller play button, no "Watch on YouTube" link */
  small?: boolean
  /** false for the hidden duplicate set of a looping row: not reachable with the keyboard */
  tabbable?: boolean
  onPlay?: () => void
}

/** Plays whatever was saved: YouTube as before, any other link through OtherVideoEmbed. */
export function YouTubeEmbed(props: EmbedProps) {
  return isYouTubeKey(props.id) ? <YouTubePlayer {...props} /> : <OtherVideoEmbed {...props} />
}

/**
 * YouTube video that loads like a normal image first (thumbnail + play button) and only loads
 * YouTube's heavy player when tapped. Faster pages, less data on phones, no tracking until played.
 * `fill` makes it fill its (relatively positioned) parent instead of forcing a 16:9 box.
 */
function YouTubePlayer({ id, title, fill = false, small = false, tabbable = true, onPlay, className = '' }: EmbedProps) {
  const [playing, setPlaying] = useState(false)

  // The video itself is always a clean 16:9 picture. In a project card (fill) it sits smaller, centered
  // in the black frame with a margin around it, so it never looks zoomed in.
  const stage = fill
    ? 'relative aspect-video w-[86%] overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
    : 'relative aspect-video w-full overflow-hidden bg-black'
  const wrap = (inner: React.ReactNode) => fill
    ? <div className={`absolute inset-0 flex items-center justify-center bg-black ${className}`}><div className={stage}>{inner}</div></div>
    : <div className={`${stage} ${className}`}>{inner}</div>

  if (playing) {
    return wrap(
      <iframe
        src={youtubeEmbedUrl(id, true)}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }
  return wrap(
    <>
      {/* hqdefault is 4:3 with black bars; cropping to the 16:9 stage removes them */}
      <img src={youtubeThumbUrl(id)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <button
        type="button"
        onClick={() => { setPlaying(true); onPlay?.() }}
        tabIndex={tabbable ? 0 : -1}
        aria-label={`Play video: ${title}`}
        className="group absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#e0ac45]"
      >
        <span className={`flex items-center justify-center rounded-full bg-[#ff0000] text-white shadow-lg transition group-hover:scale-105 ${small ? 'h-10 w-10' : fill ? 'h-12 w-12' : 'h-16 w-16'}`}>
          <Play className={`ml-1 fill-current ${small ? 'h-4 w-4' : fill ? 'h-5 w-5' : 'h-7 w-7'}`} aria-hidden />
        </span>
      </button>
      {!small && (
        <a href={youtubeWatchUrl(id)} target="_blank" rel="noopener noreferrer" className="absolute bottom-1.5 right-1.5 inline-flex min-h-9 items-center rounded bg-black/60 px-3 text-xs font-semibold text-white/90 hover:text-white">
          Watch on YouTube
        </a>
      )}
    </>
  )
}

/**
 * A video from any other site. Vimeo and .mp4 links play right in the card; Instagram and Facebook play in a pop-up
 * (their players are tall, so they would not fit a wide card); any other page opens in a new tab.
 */
function OtherVideoEmbed({ id, title, fill = false, small = false, tabbable = true, onPlay, className = '' }: EmbedProps) {
  const kind = videoKind(id)
  const label = videoLabel(id)
  const embed = videoEmbedUrl(id, true)
  const [playing, setPlaying] = useState(false)
  const [popup, setPopup] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const stage = fill
    ? 'relative aspect-video w-[86%] overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
    : 'relative aspect-video w-full overflow-hidden bg-black'
  const wrap = (inner: React.ReactNode) => fill
    ? <div className={`absolute inset-0 flex items-center justify-center bg-black ${className}`}><div className={stage}>{inner}</div></div>
    : <div className={`${stage} ${className}`}>{inner}</div>

  useEffect(() => {
    if (!popup) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopup(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popup])

  const playBtn = `flex items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition group-hover:scale-105 ${small ? 'h-10 w-10' : fill ? 'h-12 w-12' : 'h-16 w-16'}`
  const playIcon = <Play className={`ml-1 fill-current ${small ? 'h-4 w-4' : fill ? 'h-5 w-5' : 'h-7 w-7'}`} aria-hidden />
  const tile = (
    <>
      <span className="absolute inset-0 bg-gradient-to-br from-[#2b3445] via-[#151b27] to-black" aria-hidden />
      <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/90">{label}</span>
    </>
  )

  // Vimeo / a direct video file: plays inside the card
  if (playing && (kind === 'file' || (kind === 'vimeo' && embed))) {
    return wrap(kind === 'file'
      ? <video src={id} controls autoPlay playsInline className="absolute inset-0 h-full w-full bg-black object-contain" aria-label={title} />
      : <iframe src={embed!} title={title} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />)
  }

  // Any other page: a tile that opens the link in a new tab
  if (kind === 'link' || ((kind === 'instagram' || kind === 'facebook' || kind === 'vimeo') && !embed)) {
    return wrap(
      <a href={videoOpenUrl(id)} target="_blank" rel="noopener noreferrer" tabIndex={tabbable ? 0 : -1} onClick={() => onPlay?.()}
        aria-label={`Watch video on ${label}: ${title}`} className="group absolute inset-0 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#e0ac45]">
        {tile}
        <span className={`relative ${playBtn}`}>{playIcon}</span>
        {!small && <span className="absolute bottom-1.5 right-1.5 inline-flex min-h-9 items-center gap-1 rounded bg-black/60 px-3 text-xs font-semibold text-white/90">Watch on {label} <ExternalLink className="h-3 w-3" aria-hidden /></span>}
      </a>
    )
  }

  return wrap(
    <>
      <button type="button" tabIndex={tabbable ? 0 : -1} aria-label={`Play video: ${title}`}
        onClick={() => { onPlay?.(); if (kind === 'instagram' || kind === 'facebook') setPopup(true); else setPlaying(true) }}
        className="group absolute inset-0 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#e0ac45]">
        {tile}
        <span className={`relative ${playBtn}`}>{playIcon}</span>
      </button>
      {!small && kind !== 'file' && (
        <a href={videoOpenUrl(id)} target="_blank" rel="noopener noreferrer" className="absolute bottom-1.5 right-1.5 inline-flex min-h-9 items-center rounded bg-black/60 px-3 text-xs font-semibold text-white/90 hover:text-white">
          Open on {label}
        </a>
      )}
      {popup && embed && createPortal(
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" onClick={() => setPopup(false)}>
          <div className="relative h-[min(86svh,760px)] w-[min(94vw,440px)] overflow-hidden rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
            <iframe src={embed} title={title} className="h-full w-full border-0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          </div>
          <button ref={closeRef} type="button" onClick={() => setPopup(false)} aria-label="Close video"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e0ac45]">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
