'use client'

import { useState } from 'react'
import { MapPin, Download, Crown, CheckCircle2, PlayCircle } from 'lucide-react'
import { whatsappLink } from '@/lib/site-config'
import { WhatsAppIcon } from '@/components/site/WhatsAppIcon'
import type { PublicWebsiteCategory, PublicWebsiteProject } from '@/lib/website-projects'

const pillBase = 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-semibold whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b87a10]'
const outlineBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#e3dccb] bg-white px-4 text-sm font-semibold text-[#14281d] transition hover:border-[#d9a83f] hover:bg-[#fdf8ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b87a10]'

function ProjectCard({ project }: { project: PublicWebsiteProject }) {
  return (
    <article className="grid overflow-hidden rounded-2xl border border-[#e8e2d4] bg-[#fbfaf6] shadow-[0_1px_3px_rgba(20,40,29,0.06)] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* Video frame: always shown, with a placeholder until a video is uploaded */}
      <div className="relative aspect-[4/5] max-h-[75svh] w-full bg-black sm:aspect-video sm:max-h-none lg:aspect-auto lg:min-h-[420px]">
        {project.video_url ? (
          <video
            src={project.video_url}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-contain"
            aria-label={`${project.title} video`}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#14281d] to-black px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/10">
              <PlayCircle className="h-8 w-8 text-[#e0ac45]" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-white/80">Project video coming soon</p>
          </div>
        )}
      </div>
      <div className="min-w-0 p-5 sm:p-8">
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.tags.map(t => (
              <span key={t} className="rounded-md border border-[#cfc6b2] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#14281d]">{t}</span>
            ))}
          </div>
        )}
        <h3 className="mt-4 flex items-start gap-2.5 font-display text-2xl font-semibold leading-tight text-[#14281d] sm:text-3xl">
          <Crown className="mt-1.5 h-5 w-5 shrink-0 text-[#b87a10]" aria-hidden /> <span className="min-w-0 break-words">{project.title}</span>
        </h3>
        {project.location && <p className="mt-2 font-semibold text-[#9a6a12]">{project.location}</p>}

        {project.points.length > 0 && (
          <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {project.points.map((pt, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px] text-[#1f2a24]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 fill-[#e0ac45] text-white" aria-hidden />
                <span className="min-w-0 break-words">{pt}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={whatsappLink(`Hi, please share details for ${project.title}${project.location ? ` (${project.location})` : ''}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#25d366] px-6 text-sm font-semibold text-[#07090a] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b87a10]"
          >
            <WhatsAppIcon className="h-4 w-4" /> Request Details
          </a>
          {project.map_url && (
            <a href={project.map_url} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
              <MapPin className="h-4 w-4" aria-hidden /> View Location
            </a>
          )}
        </div>

        {project.downloads.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            {project.downloads.map(d => (
              <a key={d.id} href={`/api/website-projects/download/${d.id}`} target="_blank" rel="noopener noreferrer nofollow" className={`${outlineBtn} min-w-0 max-w-full`} aria-label={`${d.name} (opens in a new tab)`}>
                <Download className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{d.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

/** Public /projects listing: category pills (priority order) + project cards. */
export function WebsiteProjectsList({ categories }: { categories: PublicWebsiteCategory[] }) {
  const [active, setActive] = useState<string>('all')
  const shown = active === 'all' ? categories : categories.filter(c => c.id === active)

  return (
    <>
      <div className="border-b border-[#e8e2d4] bg-[#fbfaf6]">
        {/* One row: centered while the pills fit, scrolls sideways (thin gold scrollbar) once they don't.
            w-max + mx-auto centers without cutting off the first pills when the row overflows. */}
        <div className="mx-auto w-full max-w-7xl overflow-x-auto overscroll-x-contain [scrollbar-color:#e0ac45_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#e0ac45]">
          <div className="mx-auto flex w-max gap-3 px-4 py-4 sm:px-6 lg:px-8" role="tablist" aria-label="Project locations">
            {[{ id: 'all', name: 'All' }, ...categories].map(c => {
              const on = active === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={(e) => { setActive(c.id); e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }) }}
                  className={`${pillBase} ${on ? 'border-[#e0ac45] bg-[#e0ac45] text-[#14281d]' : 'border-[#e3d3a8] bg-white text-[#9a6a12] hover:border-[#e0ac45]'}`}
                >
                  <MapPin className="h-4 w-4" aria-hidden /> {c.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-[#f5f2ea]">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex flex-col gap-16">
            {shown.map(c => (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                <h2 id={`cat-${c.id}`} className="mb-6 flex items-center justify-center gap-3 text-center font-display text-3xl font-semibold tracking-tight text-[#14281d] sm:text-4xl">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#e6e8e2]">
                    <MapPin className="h-5 w-5 text-[#14281d]" aria-hidden />
                  </span>
                  {c.name}
                </h2>
                <div className="flex flex-col gap-8">
                  {c.projects.map(p => <ProjectCard key={p.id} project={p} />)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
