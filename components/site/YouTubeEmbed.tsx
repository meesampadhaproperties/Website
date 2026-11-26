'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { youtubeEmbedUrl, youtubeThumbUrl, youtubeWatchUrl } from '@/lib/youtube'

/**
 * YouTube video that loads like a normal image first (thumbnail + play button) and only loads
 * YouTube's heavy player when tapped. Faster pages, less data on phones, no tracking until played.
 * `fill` makes it fill its (relatively positioned) parent instead of forcing a 16:9 box.
 */
export function YouTubeEmbed({ id, title, fill = false, small = false, tabbable = true, onPlay, className = '' }: {
  id: string; title: string; fill?: boolean; className?: string
  /** Compact card (gallery, home): smaller play button, no "Watch on YouTube" link */
  small?: boolean
  /** false for the hidden duplicate set of a looping row: not reachable with the keyboard */
  tabbable?: boolean
  onPlay?: () => void
}) {
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
