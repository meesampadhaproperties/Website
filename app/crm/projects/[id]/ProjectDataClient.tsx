'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, Search, Image as ImageIcon, Film, FileText, Link2, LayoutGrid,
  ExternalLink, X, MapPin, Loader2, AlertTriangle,
} from 'lucide-react'
import { getDocumentOpenUrl, type ProjectDataItem } from '../actions'
import type { DocumentCategory } from '@/lib/project-documents'

type Filter = 'all' | DocumentCategory

const FILTERS: { id: Filter; label: string; icon: typeof ImageIcon }[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Videos', icon: Film },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'link', label: 'Links', icon: Link2 },
]

function formatBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

function hostOf(url: string | null) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' }
}

function fileExt(name: string, mime: string | null) {
  const fromName = name.includes('.') ? name.split('.').pop() : ''
  return (fromName || (mime || '').split('/').pop() || 'file').slice(0, 5).toUpperCase()
}

export default function ProjectDataClient({ project, items, loadError }: {
  project: { id: string; name: string; client_name: string; area_name: string | null } | null
  items: ProjectDataItem[]
  loadError: string | null
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [lightbox, setLightbox] = useState<ProjectDataItem | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, image: 0, video: 0, document: 0, link: 0 }
    items.forEach(i => { c[i.category] += 1 })
    return c
  }, [items])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      (filter === 'all' || i.category === filter) &&
      (!q || i.name.toLowerCase().includes(q) || (i.url || '').toLowerCase().includes(q))
    )
  }, [items, filter, search])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [lightbox])

  // Fresh signed URL on click (previews expire after an hour; links open directly)
  async function openItem(item: ProjectDataItem) {
    if (item.category === 'link' && item.url) { window.open(item.url, '_blank', 'noopener,noreferrer'); return }
    setOpeningId(item.id)
    const res = await getDocumentOpenUrl(item.id)
    setOpeningId(null)
    if (!res.success || !res.url) { toast.error(res.error || 'Could not open file'); return }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link href="/crm/projects" className="mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 -ml-2 text-sm font-semibold text-[#5a6a82] hover:bg-white hover:text-[#0f1d33]">
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </Link>

      {project && (
        <div className="mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-[#0f1d33] break-words">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5a6a82]">
            {project.client_name && <span>{project.client_name}</span>}
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-brand" />{project.area_name || 'Unassigned'}</span>
            <span>{counts.all} item{counts.all === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Could not load this project: {loadError}
        </div>
      )}

      {/* Search + filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#e8ecf2] bg-white p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a99ad]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files and links"
            className="w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-[#f8fafc] pl-9 pr-3 text-sm text-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by type">
          {FILTERS.map(f => {
            const active = filter === f.id
            const Icon = f.icon
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  active ? 'border-[#0f1d33] bg-[#0f1d33] text-white' : 'border-[#e8ecf2] bg-white text-[#5a6a82] hover:bg-[#f3f5f8]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {f.label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-[#f3f5f8]'}`}>{counts[f.id]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e8ecf2] bg-white py-16 text-center">
          <LayoutGrid className="h-8 w-8 text-[#8a99ad]" />
          <p className="text-sm font-semibold text-[#0f1d33]">{items.length === 0 ? 'Nothing uploaded yet' : 'No matches'}</p>
          <p className="text-xs text-[#8a99ad]">{items.length === 0 ? 'Add documents from the Projects page.' : 'Try another filter or search.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map(item => (
            <div key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e8ecf2] bg-white shadow-xs">
              {/* Preview */}
              {item.category === 'image' && item.preview_url ? (
                <button onClick={() => setLightbox(item)} className="block aspect-[4/3] w-full overflow-hidden bg-[#f3f5f8] cursor-zoom-in" aria-label={`View ${item.name}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.preview_url} alt={item.name} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />
                </button>
              ) : item.category === 'video' && item.preview_url ? (
                <video src={item.preview_url} controls preload="metadata" playsInline className="aspect-[4/3] w-full bg-black object-contain" />
              ) : (
                <button onClick={() => openItem(item)} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-[#f8fafc] hover:bg-[#f3f5f8] cursor-pointer" aria-label={`Open ${item.name}`}>
                  {item.category === 'link'
                    ? <Link2 className="h-8 w-8 text-[#1e3a5f]" />
                    : item.category === 'video' ? <Film className="h-8 w-8 text-[#1e3a5f]" />
                    : item.category === 'image' ? <ImageIcon className="h-8 w-8 text-[#1e3a5f]" />
                    : <FileText className="h-8 w-8 text-[#1e3a5f]" />}
                  <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-[#5a6a82] border border-[#e8ecf2]">
                    {item.category === 'link' ? (hostOf(item.url) || 'LINK') : fileExt(item.name, item.mime_type)}
                  </span>
                </button>
              )}

              {/* Details */}
              <div className="flex min-w-0 flex-1 items-start gap-1 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#0f1d33]" title={item.name}>{item.name}</p>
                  <p className="truncate text-[10px] text-[#8a99ad]">
                    {item.category === 'link' ? hostOf(item.url) : formatBytes(item.size_bytes)} · {formatDate(item.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => openItem(item)}
                  disabled={openingId === item.id}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer disabled:cursor-wait"
                  aria-label={`Open ${item.name} in a new tab`}
                  title="Open in new tab"
                >
                  {openingId === item.id ? <Loader2 className="h-4 w-4 animate-spin text-[#5a6a82]" /> : <ExternalLink className="h-4 w-4 text-[#5a6a82]" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image lightbox */}
      {lightbox?.preview_url && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <p className="min-w-0 truncate text-sm font-semibold">{lightbox.name}</p>
            <div className="flex shrink-0 gap-1">
              <button onClick={(e) => { e.stopPropagation(); openItem(lightbox) }} className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer" aria-label="Open original in a new tab">
                <ExternalLink className="h-5 w-5" />
              </button>
              <button onClick={() => setLightbox(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.preview_url} alt={lightbox.name} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
