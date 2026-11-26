'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Globe, Plus, X, Search, Loader2, Trash2, Pencil, Tag, Video, Upload, Download, ChevronDown,
  CheckCircle2, AlertTriangle, Check, ImagePlus, Images, Star, Play, Link2, ChevronLeft, ChevronRight, Quote,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { StorageIndicator } from '@/components/StorageIndicator'
import { shrinkImage } from '@/lib/image-shrink'
import { parseYouTubeId, youtubeThumbUrl, youtubeWatchUrl } from '@/lib/youtube'
import {
  WEBSITE_MAX_DOWNLOADS, WEBSITE_MAX_POINTS, WEBSITE_POINT_MAX_CHARS, WEBSITE_MAX_VIDEO_BYTES, WEBSITE_MEDIA_BUCKET, WEBSITE_VIDEO_MIME, isWebsiteDownloadable,
  WEBSITE_TITLE_MAX_CHARS, WEBSITE_LOCATION_MAX_CHARS, WEBSITE_MAX_TAGS, WEBSITE_TAG_MAX_CHARS, WEBSITE_MAP_URL_MAX_CHARS, splitTags,
  WEBSITE_PROJECT_EXTRA_VIDEOS_MAX, WEBSITE_GALLERY_BUCKET, WEBSITE_GALLERY_MAX_IMAGES, WEBSITE_GALLERY_SOURCE_MAX_BYTES, WEBSITE_GALLERY_MIMES, WEBSITE_REVIEW_TITLE_MAX_CHARS, WEBSITE_TESTIMONIAL_TITLE_MAX_CHARS,
} from '@/lib/website-projects-shared'
import {
  createWebsiteCategory, updateWebsiteCategory, deleteWebsiteCategory, createWebsiteVideoUpload,
  saveWebsiteProject, setWebsiteProjectPublished, deleteWebsiteProject,
  createWebsiteGalleryUpload, addWebsiteGalleryImages, deleteWebsiteGalleryImage,
  createWebsiteReview, updateWebsiteReview, setWebsiteReviewPublished, deleteWebsiteReview,
  createWebsiteTestimonialVideoUpload, saveWebsiteTestimonial, setWebsiteTestimonialPublished, deleteWebsiteTestimonial,
  createWebsiteProjectVideoUpload, addWebsiteProjectVideos, deleteWebsiteProjectVideo,
  type WebsiteCategory, type WebsiteProjectRow, type CrmProjectOption, type WebsiteReviewRow, type WebsiteTestimonialRow, type GalleryImage, type ExtraVideo, type ExtraVideoInput,
} from './actions'

// text-base below sm: iOS Safari zooms into any input under 16px
const inputCls = 'w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-[#f8fafc] px-3 text-base sm:text-sm text-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]'
const labelCls = 'text-xs font-semibold text-[#5a6a82]'
const primaryBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer'
const secondaryBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#e8ecf2] bg-white px-4 text-sm font-semibold text-[#0f1d33] hover:bg-[#f3f5f8] transition-colors cursor-pointer'
// Header buttons: one line even on 360px phones (smaller text/padding below sm)
const headerBtn = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition-colors cursor-pointer sm:gap-2 sm:px-4 sm:text-sm'
const iconBtn = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg cursor-pointer transition-colors'

const sortCategories = (list: WebsiteCategory[]) =>
  [...list].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))

const countTone = (left: number, warnAt: number) => (left <= 0 ? 'text-red-600' : left <= warnAt ? 'text-amber-600' : 'text-[#8a99ad]')

/** Text field with a live "characters left" countdown next to its label. */
function LimitedInput({ label, value, onChange, max, placeholder, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; type?: string; required?: boolean
}) {
  const left = max - value.length
  return (
    <label className={labelCls}>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">{label}</span>
        <span aria-live="polite" className={`shrink-0 tabular-nums ${countTone(left, Math.max(5, Math.round(max / 6)))}`}>{left} left</span>
      </span>
      <input type={type} required={required} maxLength={max} value={value} onChange={(e) => onChange(e.target.value.slice(0, max))} placeholder={placeholder} className={`${inputCls} mt-1`} />
    </label>
  )
}

/** Comma-separated tags with a live "x of 4 tags" count and a per-tag length check. */
function TagsInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tags = splitTags(value)
  const tooMany = tags.length > WEBSITE_MAX_TAGS
  const longTag = tags.find(t => t.length > WEBSITE_TAG_MAX_CHARS)
  const maxRaw = WEBSITE_MAX_TAGS * (WEBSITE_TAG_MAX_CHARS + 2)
  return (
    <label className={labelCls}>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">Tags (comma separated)</span>
        <span aria-live="polite" className={`shrink-0 tabular-nums ${tooMany ? 'text-red-600' : tags.length === WEBSITE_MAX_TAGS ? 'text-amber-600' : 'text-[#8a99ad]'}`}>{tags.length} of {WEBSITE_MAX_TAGS} tags</span>
      </span>
      <input maxLength={maxRaw} value={value} onChange={(e) => onChange(e.target.value.slice(0, maxRaw))} placeholder="e.g. Open Plots, HMDA Approved" className={`${inputCls} mt-1 ${tooMany || longTag ? 'border-red-300' : ''}`} />
      <span className={`mt-1 block text-[11px] font-normal ${tooMany || longTag ? 'text-red-600' : 'text-[#8a99ad]'}`}>
        {tooMany ? `Only ${WEBSITE_MAX_TAGS} tags are allowed. Remove ${tags.length - WEBSITE_MAX_TAGS}.`
          : longTag ? `"${longTag.slice(0, 24)}…" is ${longTag.length - WEBSITE_TAG_MAX_CHARS} characters too long (max ${WEBSITE_TAG_MAX_CHARS} per tag).`
          : `Up to ${WEBSITE_MAX_TAGS} tags, ${WEBSITE_TAG_MAX_CHARS} characters each.`}
      </span>
    </label>
  )
}

/** Mobile bottom-sheet / desktop centered modal with backdrop scroll-lock and Esc to close */
function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = orig; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92vh] max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8ecf2] bg-white px-4 py-3">
          <h2 className="truncate text-base font-bold text-[#0f1d33]">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label="Close">
            <X className="h-5 w-5 text-[#5a6a82]" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

/** Dropdown with checkboxes: the chosen CRM project's documents, max WEBSITE_MAX_DOWNLOADS, in pick order. */
function DocumentPicker({ documents, selected, onChange, disabled }: {
  documents: CrmProjectOption['documents']
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const toggle = (id: string) => {
    if (selected.includes(id)) return onChange(selected.filter(s => s !== id))
    if (selected.length >= WEBSITE_MAX_DOWNLOADS) return void toast.error(`You can pick up to ${WEBSITE_MAX_DOWNLOADS} documents.`)
    onChange([...selected, id])
  }

  const label = disabled
    ? 'Choose a CRM project first'
    : documents.length === 0
      ? 'No PDF documents (max 25 MB) in this project'
      : selected.length === 0 ? 'Select documents' : `${selected.length} of ${WEBSITE_MAX_DOWNLOADS} selected`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled || documents.length === 0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}
        className={`${inputCls} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`truncate ${selected.length ? 'font-semibold' : 'text-[#8a99ad]'}`}>{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#5a6a82] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#e8ecf2] bg-white p-1 shadow-lg">
          {documents.map(d => {
            const checked = selected.includes(d.id)
            const full = !checked && selected.length >= WEBSITE_MAX_DOWNLOADS
            return (
              <li key={d.id}>
                <label className={`flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm ${full ? 'opacity-50' : 'hover:bg-[#f8fafc] cursor-pointer'}`}>
                  <input type="checkbox" checked={checked} disabled={full} onChange={() => toggle(d.id)} className="h-4 w-4 shrink-0 accent-[#0f1d33]" />
                  <span className="min-w-0 flex-1 truncate text-[#0f1d33]">{d.name}</span>
                  <span className="shrink-0 text-[10px] uppercase text-[#8a99ad]">{d.doc_type === 'link' ? 'Link' : (d.mime_type || '').split('/')[1]?.slice(0, 6) || 'File'}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** On/off switch for "shown on the website". Green = visible to visitors, grey = hidden. */
function PublishToggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={on ? 'Shown on the website. Click to hide.' : 'Hidden from the website. Click to show.'}
      onClick={onChange}
      className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-lg px-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f1d33]"
    >
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-[#cbd3df]'}`}>
        <span className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

/**
 * One horizontal row with a scrollbar and left/right arrows. New items are added at the end of the row.
 * Arrows show only on the side that still has something to scroll to; on phones you can also just swipe.
 */
function HScroller({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    update()
    const ro = new ResizeObserver(update) // fires when the box resizes or a card is added/removed
    if (ref.current) ro.observe(ref.current)
    if (inner.current) ro.observe(inner.current)
    return () => ro.disconnect()
  }, [update])

  const go = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * Math.max(240, Math.round(ref.current.clientWidth * 0.85)), behavior: 'smooth' })
  const arrow = 'absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#e8ecf2] bg-white text-[#0f1d33] shadow-md hover:bg-[#f3f5f8] cursor-pointer'

  return (
    <div className="relative">
      {edge.left && <button type="button" onClick={() => go(-1)} className={`${arrow} -left-1 sm:-left-3`} aria-label={`Scroll ${label} left`}><ChevronLeft className="h-5 w-5" /></button>}
      {edge.right && <button type="button" onClick={() => go(1)} className={`${arrow} -right-1 sm:-right-3`} aria-label={`Scroll ${label} right`}><ChevronRight className="h-5 w-5" /></button>}
      <div ref={ref} onScroll={update} role="region" aria-label={label} tabIndex={0}
        className="overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-proximity pb-3 [scrollbar-width:thin] [scrollbar-color:#c9d2df_transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f1d33] rounded-xl">
        <div ref={inner} className="flex w-max gap-3 md:gap-4">{children}</div>
      </div>
    </div>
  )
}

/** A video picked in the form but not saved yet: a YouTube id, or an MP4 waiting to be uploaded on Save. */
type StagedVideo = { key: string; kind: 'youtube' | 'file'; id?: string; file?: File; preview?: string }

type FormState = {
  id: string | null
  categoryId: string
  crmProjectId: string
  title: string
  location: string
  tags: string
  points: string[]
  mapUrl: string
  isPublished: boolean
  documentIds: string[]
  videoMode: 'upload' | 'youtube'
  youtubeUrl: string
  videoFile: File | null
  videoPreview: string | null
  currentVideoUrl: string | null
  removeVideo: boolean
  images: GalleryImage[]
  newImages: { key: string; file: File; preview: string }[]
  extraVideos: ExtraVideo[]
  newVideos: StagedVideo[]
  ytDraft: string
}

const emptyPoints = () => Array.from({ length: WEBSITE_MAX_POINTS }, () => '')

export default function WebsiteProjectsClient({
  initialCategories, initialProjects, crmProjects, initialReviews, initialTestimonials, loadError, canEdit,
}: {
  initialCategories: WebsiteCategory[]
  initialProjects: WebsiteProjectRow[]
  crmProjects: CrmProjectOption[]
  initialReviews: WebsiteReviewRow[]
  initialTestimonials: WebsiteTestimonialRow[]
  loadError: string | null
  canEdit: boolean
}) {
  const [categories, setCategories] = useState(() => sortCategories(initialCategories))
  const [projects, setProjects] = useState(initialProjects)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [storageKey, setStorageKey] = useState(0)
  const refreshStorage = () => setStorageKey(k => k + 1)
  const [busyLabel, setBusyLabel] = useState('')
  const [reviews, setReviews] = useState(initialReviews)
  // Set when the picture badge on a project card is clicked: the form opens scrolled to the pictures section
  const [focusPictures, setFocusPictures] = useState(false)
  const [testimonials, setTestimonials] = useState(initialTestimonials)
  const [tTitle, setTTitle] = useState('')
  const [tMode, setTMode] = useState<'youtube' | 'video'>('youtube')
  const [tUrl, setTUrl] = useState('')
  const [tFile, setTFile] = useState<File | null>(null)
  const [tPreview, setTPreview] = useState<string | null>(null)
  const [tCurrent, setTCurrent] = useState<string | null>(null) // the uploaded MP4 an existing testimonial already has
  const [revTitle, setRevTitle] = useState('')
  const [revUrl, setRevUrl] = useState('')
  const [modal, setModal] = useState<null | { type: 'category'; category: WebsiteCategory | null } | { type: 'project' } | { type: 'review'; review: WebsiteReviewRow | null } | { type: 'testimonial'; item: WebsiteTestimonialRow | null }>(null)

  const [catName, setCatName] = useState('')
  const [catPriority, setCatPriority] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const set = (patch: Partial<FormState>) => setForm(f => (f ? { ...f, ...patch } : f))

  // Free the local video preview when it changes or the modal closes
  useEffect(() => () => { if (form?.videoPreview) URL.revokeObjectURL(form.videoPreview) }, [form?.videoPreview])
  useEffect(() => () => { if (tPreview) URL.revokeObjectURL(tPreview) }, [tPreview])
  useEffect(() => {
    if (!focusPictures || modal?.type !== 'project' || !form) return
    const t = window.setTimeout(() => {
      document.getElementById('project-pictures')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      setFocusPictures(false)
    }, 80)
    return () => window.clearTimeout(t)
  }, [focusPictures, modal, form])
  // Free staged picture previews when the form closes
  const stagedRef = useRef<string[]>([])
  useEffect(() => {
    stagedRef.current = [...(form?.newImages || []).map(i => i.preview), ...(form?.newVideos || []).map(v => v.preview).filter((u): u is string => !!u)]
  }, [form?.newImages, form?.newVideos])
  useEffect(() => () => { stagedRef.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const crmById = useMemo(() => new Map(crmProjects.map(p => [p.id, p])), [crmProjects])
  const docName = (id: string) => {
    for (const p of crmProjects) { const d = p.documents.find(x => x.id === id); if (d) return d.name }
    return 'Document'
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = (p: WebsiteProjectRow) => !q ||
      p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) || p.points.some(t => t.toLowerCase().includes(q))
    return categories
      .filter(c => categoryFilter === 'all' || c.id === categoryFilter)
      .map(c => ({ category: c, projects: projects.filter(p => p.category_id === c.id && match(p)) }))
      .filter(g => g.projects.length > 0 || (!q && categoryFilter !== 'all'))
  }, [categories, projects, search, categoryFilter])

  const filteredTestimonials = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? testimonials.filter(t => t.title.toLowerCase().includes(q)) : testimonials
  }, [testimonials, search])

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? reviews.filter(r => r.title.toLowerCase().includes(q)) : reviews
  }, [reviews, search])

  const closeModal = () => {
    if (busy) return
    stagedRef.current.forEach(u => URL.revokeObjectURL(u))
    setModal(null); setForm(null)
  }

  // ---------- Categories ----------
  const openCategory = (category: WebsiteCategory | null) => {
    setCatName(category?.name || '')
    const next = categories.length ? Math.max(...categories.map(c => c.priority)) + 1 : 1
    setCatPriority(String(category?.priority ?? Math.min(next, 9999)))
    setModal({ type: 'category', category })
  }

  const submitCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'category') return
    const editing = modal.category
    setBusy(true)
    const res = editing
      ? await updateWebsiteCategory(editing.id, catName, Number(catPriority))
      : await createWebsiteCategory(catName, Number(catPriority))
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setCategories(prev => sortCategories(editing ? prev.map(c => (c.id === editing.id ? res.category! : c)) : [...prev, res.category!]))
    toast.success(editing ? 'Category updated' : `Category "${res.category!.name}" created`)
    setModal(null)
  }

  const removeCategory = async (category: WebsiteCategory) => {
    if (!confirm(`Delete category "${category.name}"?`)) return
    const res = await deleteWebsiteCategory(category.id)
    if (!res.success) return toast.error(res.error)
    setCategories(prev => prev.filter(c => c.id !== category.id))
    if (categoryFilter === category.id) setCategoryFilter('all')
    toast.success('Category deleted')
  }

  // ---------- Projects ----------
  const openProject = (p: WebsiteProjectRow | null, focus?: 'images') => {
    if (!p && categories.length === 0) return void toast.error('Create a category first.')
    const points = emptyPoints()
    p?.points.forEach((pt, i) => { if (i < points.length) points[i] = pt })
    setForm({
      id: p?.id || null,
      categoryId: p?.category_id || (categoryFilter !== 'all' ? categoryFilter : categories[0]?.id || ''),
      crmProjectId: p?.crm_project_id && crmById.has(p.crm_project_id) ? p.crm_project_id : '',
      title: p?.title || '',
      location: p?.location || '',
      tags: (p?.tags || []).join(', '),
      points,
      mapUrl: p?.map_url || '',
      isPublished: p ? p.is_published : true,
      documentIds: p?.document_ids || [],
      videoMode: p?.youtube_id ? 'youtube' : 'upload',
      youtubeUrl: p?.youtube_id ? youtubeWatchUrl(p.youtube_id) : '',
      videoFile: null,
      videoPreview: null,
      currentVideoUrl: p?.video_url || null,
      removeVideo: false,
      images: p?.images || [],
      newImages: [],
      extraVideos: p?.extra_videos || [],
      newVideos: [],
      ytDraft: '',
    })
    setModal({ type: 'project' })
    if (focus === 'images') setFocusPictures(true)
  }

  const pickVideo = (file: File | null) => {
    if (!file) return
    if (file.type !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(file.name)) return void toast.error('Only MP4 videos are allowed.')
    if (file.size > WEBSITE_MAX_VIDEO_BYTES) return void toast.error('The video must be 45 MB or smaller.')
    set({ videoFile: file, videoPreview: URL.createObjectURL(file), removeVideo: false })
  }

  // ----- more videos per project (shown on the Gallery page; only the main video shows on the Projects page)
  const extraCount = form ? form.extraVideos.length + form.newVideos.length : 0

  const stageYoutube = () => {
    if (!form) return
    const id = parseYouTubeId(form.ytDraft)
    if (!id) return void toast.error('Enter a valid YouTube video link.')
    if (extraCount >= WEBSITE_PROJECT_EXTRA_VIDEOS_MAX) return void toast.error(`A project can have up to ${WEBSITE_PROJECT_EXTRA_VIDEOS_MAX} extra videos.`)
    const dup = form.extraVideos.some(v => v.youtube_id === id) || form.newVideos.some(v => v.kind === 'youtube' && v.id === id)
    if (dup) return void toast.error('That YouTube video is already added.')
    set({ newVideos: [...form.newVideos, { key: `yt-${id}-${Date.now()}`, kind: 'youtube', id }], ytDraft: '' })
  }

  const stageMp4s = (files: FileList | null) => {
    if (!files || !form) return
    const room = WEBSITE_PROJECT_EXTRA_VIDEOS_MAX - extraCount
    const accepted: StagedVideo[] = []
    for (const file of Array.from(files)) {
      if (accepted.length >= room) { toast.error(`Only ${Math.max(room, 0)} more video${room === 1 ? '' : 's'} fit (max ${WEBSITE_PROJECT_EXTRA_VIDEOS_MAX}).`); break }
      if (file.type !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(file.name)) { toast.error(`"${file.name}": only MP4 videos are allowed.`); continue }
      if (file.size > WEBSITE_MAX_VIDEO_BYTES) { toast.error(`"${file.name}" is over 45 MB.`); continue }
      accepted.push({ key: `f-${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, kind: 'file', file, preview: URL.createObjectURL(file) })
    }
    if (accepted.length) set({ newVideos: [...form.newVideos, ...accepted] })
  }

  const dropNewVideo = (key: string) => {
    if (!form) return
    const v = form.newVideos.find(x => x.key === key)
    if (v?.preview) URL.revokeObjectURL(v.preview)
    set({ newVideos: form.newVideos.filter(x => x.key !== key) })
  }

  const removeSavedVideo = async (v: ExtraVideo) => {
    if (!form) return
    if (!confirm('Delete this video? It is removed from the website Gallery right away.')) return
    const res = await deleteWebsiteProjectVideo(v.id)
    if (!res.success) return toast.error(res.error)
    set({ extraVideos: form.extraVideos.filter(x => x.id !== v.id) })
    setProjects(prev => prev.map(p => (p.id === form.id ? { ...p, extra_videos: p.extra_videos.filter(x => x.id !== v.id) } : p)))
    refreshStorage()
    toast.success('Video deleted')
  }

  const pickImages = (files: FileList | null) => {
    if (!files || !form) return
    const room = WEBSITE_GALLERY_MAX_IMAGES - form.images.length - form.newImages.length
    if (room <= 0) return void toast.error(`A project can have up to ${WEBSITE_GALLERY_MAX_IMAGES} pictures.`)
    const accepted: FormState['newImages'] = []
    for (const file of Array.from(files)) {
      if (accepted.length >= room) { toast.error(`Only ${room} more picture${room === 1 ? '' : 's'} fit (max ${WEBSITE_GALLERY_MAX_IMAGES}).`); break }
      if (!WEBSITE_GALLERY_MIMES.includes(file.type)) { toast.error(`"${file.name}": use JPG, PNG or WebP pictures.`); continue }
      if (file.size > WEBSITE_GALLERY_SOURCE_MAX_BYTES) { toast.error(`"${file.name}" is over 25 MB.`); continue }
      accepted.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file, preview: URL.createObjectURL(file) })
    }
    if (accepted.length) set({ newImages: [...form.newImages, ...accepted] })
  }

  const dropNewImage = (key: string) => {
    if (!form) return
    const img = form.newImages.find(i => i.key === key)
    if (img) URL.revokeObjectURL(img.preview)
    set({ newImages: form.newImages.filter(i => i.key !== key) })
  }

  const removeSavedImage = async (img: GalleryImage) => {
    if (!form) return
    if (!confirm('Delete this picture? It is removed from the website gallery right away.')) return
    const res = await deleteWebsiteGalleryImage(img.id)
    if (!res.success) return toast.error(res.error)
    set({ images: form.images.filter(i => i.id !== img.id) })
    setProjects(prev => prev.map(p => (p.id === form.id ? { ...p, images: p.images.filter(i => i.id !== img.id) } : p)))
    refreshStorage()
    toast.success('Picture deleted')
  }

  const submitProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (!form.categoryId) return toast.error('Choose a category.')
    if (!form.title.trim()) return toast.error('Project title is required.')
    const tagList = splitTags(form.tags)
    if (tagList.length > WEBSITE_MAX_TAGS) return toast.error(`Only ${WEBSITE_MAX_TAGS} tags are allowed.`)
    if (tagList.some(t => t.length > WEBSITE_TAG_MAX_CHARS)) return toast.error(`Each tag can be up to ${WEBSITE_TAG_MAX_CHARS} characters.`)
    const useYoutube = form.videoMode === 'youtube' && form.youtubeUrl.trim() !== ''
    if (useYoutube && !parseYouTubeId(form.youtubeUrl)) return toast.error('Enter a valid YouTube video link.')

    setBusy(true)
    try {
      let video: { path: string; mimeType: string; sizeBytes: number } | null = null
      if (form.videoMode === 'upload' && form.videoFile) {
        setBusyLabel('Uploading video…')
        const f = form.videoFile
        const start = await createWebsiteVideoUpload({ fileName: f.name, mimeType: f.type, sizeBytes: f.size })
        if (!start.success) return void toast.error(start.error)
        const { error } = await createClient().storage.from(WEBSITE_MEDIA_BUCKET)
          .uploadToSignedUrl(start.path!, start.token!, f, { contentType: f.type })
        if (error) return void toast.error('Video upload failed', { description: error.message })
        video = { path: start.path!, mimeType: f.type, sizeBytes: f.size }
      }

      setBusyLabel('Saving…')
      const res = await saveWebsiteProject({
        id: form.id,
        categoryId: form.categoryId,
        crmProjectId: form.crmProjectId || null,
        title: form.title,
        location: form.location,
        tags: splitTags(form.tags),
        points: form.points,
        mapUrl: form.mapUrl,
        isPublished: form.isPublished,
        documentIds: form.documentIds,
        video,
        // YouTube mode sends the link (the server drops any uploaded video to save space); upload mode clears the link
        youtubeUrl: form.videoMode === 'youtube' ? form.youtubeUrl : '',
        removeVideo: form.removeVideo || (form.videoMode === 'youtube' && !!form.currentVideoUrl),
      })
      if (!res.success) return void toast.error(res.error)
      let saved = res.project!
      refreshStorage()

      // Pictures: shrink in the browser, upload straight to storage, then record them
      if (form.newImages.length > 0) {
        const uploaded: { path: string; thumbPath: string | null; mimeType: string; sizeBytes: number }[] = []
        const problems: string[] = []
        for (let i = 0; i < form.newImages.length; i++) {
          setBusyLabel(`Uploading picture ${i + 1} of ${form.newImages.length}…`)
          try {
            const { blob, mimeType } = await shrinkImage(form.newImages[i].file)
            const start = await createWebsiteGalleryUpload({ projectId: saved.id, fileName: form.newImages[i].file.name, mimeType, sizeBytes: blob.size })
            if (!start.success) { problems.push(start.error || 'Upload failed'); continue }
            const { error } = await createClient().storage.from(WEBSITE_GALLERY_BUCKET).uploadToSignedUrl(start.path!, start.token!, blob, { contentType: mimeType })
            if (error) { problems.push(error.message); continue }
            // A small copy (640 px) for the website grid, so visitors do not download the big file for every thumbnail
            let thumbPath: string | null = null
            try {
              const thumb = await shrinkImage(form.newImages[i].file, 640, 0.78)
              const tStart = await createWebsiteGalleryUpload({ projectId: saved.id, fileName: form.newImages[i].file.name, mimeType: thumb.mimeType, sizeBytes: thumb.blob.size, thumbOf: start.path! })
              if (tStart.success) {
                const { error: tErr } = await createClient().storage.from(WEBSITE_GALLERY_BUCKET).uploadToSignedUrl(tStart.path!, tStart.token!, thumb.blob, { contentType: thumb.mimeType })
                if (!tErr) thumbPath = tStart.path!
              }
            } catch { /* no thumbnail: this picture just uses its full file in the grid */ }
            uploaded.push({ path: start.path!, thumbPath, mimeType, sizeBytes: blob.size })
          } catch (err: any) {
            problems.push(err?.message || 'Picture failed')
          }
        }
        if (uploaded.length > 0) {
          setBusyLabel('Saving pictures…')
          const added = await addWebsiteGalleryImages(saved.id, uploaded)
          if (added.success) saved = { ...saved, images: added.images! }
          else problems.push(added.error || 'Pictures could not be saved')
        }
        refreshStorage()
        if (problems.length > 0) toast.error(`${problems.length} picture${problems.length === 1 ? '' : 's'} not added`, { description: problems[0] })
      }

      // Extra videos: YouTube links are saved as they are; MP4s are uploaded straight to storage first
      if (form.newVideos.length > 0) {
        const items: ExtraVideoInput[] = []
        const problems: string[] = []
        for (let i = 0; i < form.newVideos.length; i++) {
          const v = form.newVideos[i]
          if (v.kind === 'youtube') { items.push({ youtubeUrl: youtubeWatchUrl(v.id!) }); continue }
          setBusyLabel(`Uploading video ${i + 1} of ${form.newVideos.length}…`)
          try {
            const f = v.file!
            const start = await createWebsiteProjectVideoUpload({ projectId: saved.id, fileName: f.name, mimeType: f.type, sizeBytes: f.size })
            if (!start.success) { problems.push(start.error || 'Upload failed'); continue }
            const { error } = await createClient().storage.from(WEBSITE_MEDIA_BUCKET).uploadToSignedUrl(start.path!, start.token!, f, { contentType: f.type })
            if (error) { problems.push(error.message); continue }
            items.push({ path: start.path!, mimeType: f.type, sizeBytes: f.size })
          } catch (err: any) {
            problems.push(err?.message || 'Video failed')
          }
        }
        if (items.length > 0) {
          setBusyLabel('Saving videos…')
          const added = await addWebsiteProjectVideos(saved.id, items)
          if (added.success) saved = { ...saved, extra_videos: added.videos! }
          else problems.push(added.error || 'Videos could not be saved')
        }
        refreshStorage()
        if (problems.length > 0) toast.error(`${problems.length} video${problems.length === 1 ? '' : 's'} not added`, { description: problems[0] })
      }

      setProjects(prev => (form.id ? prev.map(p => (p.id === saved.id ? saved : p)) : [saved, ...prev]))
      toast.success(form.id ? 'Website project updated' : `"${saved.title}" is saved${saved.is_published ? ' and live on the website' : ''}`)
      stagedRef.current.forEach(u => URL.revokeObjectURL(u))
      setModal(null)
      setForm(null)
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const togglePublished = async (p: WebsiteProjectRow) => {
    const next = !p.is_published
    setProjects(prev => prev.map(x => (x.id === p.id ? { ...x, is_published: next } : x)))
    const res = await setWebsiteProjectPublished(p.id, next)
    if (!res.success) {
      setProjects(prev => prev.map(x => (x.id === p.id ? { ...x, is_published: !next } : x)))
      return toast.error(res.error)
    }
    toast.success(next ? 'Shown on the website' : 'Hidden from the website')
  }

  const removeProject = async (p: WebsiteProjectRow) => {
    if (!confirm(`Delete website project "${p.title}"?\n\nIts video is deleted. The CRM project and its documents are kept.`)) return
    const res = await deleteWebsiteProject(p.id)
    if (!res.success) return toast.error(res.error)
    setProjects(prev => prev.filter(x => x.id !== p.id))
    toast.success('Website project deleted')
    refreshStorage()
  }

  // ---------- Testimonials (home page) ----------
  const openTestimonial = (t: WebsiteTestimonialRow | null) => {
    setTTitle(t?.title || '')
    setTMode(t ? (t.youtube_id ? 'youtube' : 'video') : 'youtube')
    setTUrl(t?.youtube_id ? youtubeWatchUrl(t.youtube_id) : '')
    setTFile(null)
    setTPreview(null)
    setTCurrent(t?.video_url || null)
    setModal({ type: 'testimonial', item: t })
  }

  const pickTestimonialVideo = (file: File | null) => {
    if (!file) return
    if (file.type !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(file.name)) return void toast.error('Only MP4 videos are allowed.')
    if (file.size > WEBSITE_MAX_VIDEO_BYTES) return void toast.error('The video must be 45 MB or smaller.')
    setTFile(file)
    setTPreview(URL.createObjectURL(file))
  }

  const submitTestimonial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'testimonial') return
    const editing = modal.item
    if (!tTitle.trim()) return toast.error('Testimonial title is required.')
    if (tMode === 'youtube' && !parseYouTubeId(tUrl)) return toast.error('Enter a valid YouTube video link.')
    if (tMode === 'video' && !tFile && !tCurrent) return toast.error('Choose an MP4 video to upload.')

    setBusy(true)
    try {
      let video: { path: string; mimeType: string; sizeBytes: number } | null = null
      if (tMode === 'video' && tFile) {
        setBusyLabel('Uploading video…')
        const start = await createWebsiteTestimonialVideoUpload({ fileName: tFile.name, mimeType: tFile.type, sizeBytes: tFile.size })
        if (!start.success) return void toast.error(start.error)
        const { error } = await createClient().storage.from(WEBSITE_MEDIA_BUCKET).uploadToSignedUrl(start.path!, start.token!, tFile, { contentType: tFile.type })
        if (error) return void toast.error('Video upload failed', { description: error.message })
        video = { path: start.path!, mimeType: tFile.type, sizeBytes: tFile.size }
      }
      setBusyLabel('Saving…')
      const res = await saveWebsiteTestimonial({ id: editing?.id || null, title: tTitle, source: tMode, youtubeUrl: tMode === 'youtube' ? tUrl : undefined, video })
      if (!res.success) return void toast.error(res.error)
      setTestimonials(prev => (editing ? prev.map(x => (x.id === editing.id ? res.testimonial! : x)) : [...prev, res.testimonial!]))
      refreshStorage()
      toast.success(editing ? 'Testimonial updated' : 'Testimonial added to the home page')
      setModal(null)
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const toggleTestimonial = async (t: WebsiteTestimonialRow) => {
    const next = !t.is_published
    setTestimonials(prev => prev.map(x => (x.id === t.id ? { ...x, is_published: next } : x)))
    const res = await setWebsiteTestimonialPublished(t.id, next)
    if (!res.success) {
      setTestimonials(prev => prev.map(x => (x.id === t.id ? { ...x, is_published: !next } : x)))
      return toast.error(res.error)
    }
    toast.success(next ? 'Testimonial shown on the home page' : 'Testimonial hidden from the home page')
  }

  const removeTestimonial = async (t: WebsiteTestimonialRow) => {
    if (!confirm(`Delete the testimonial "${t.title}"?${t.video_url ? '\n\nIts uploaded video is deleted too.' : ''}`)) return
    const res = await deleteWebsiteTestimonial(t.id)
    if (!res.success) return toast.error(res.error)
    setTestimonials(prev => prev.filter(x => x.id !== t.id))
    refreshStorage()
    toast.success('Testimonial deleted')
  }

  // ---------- Reviews (YouTube) ----------
  const openReview = (review: WebsiteReviewRow | null) => {
    setRevTitle(review?.title || '')
    setRevUrl(review ? youtubeWatchUrl(review.youtube_id) : '')
    setModal({ type: 'review', review })
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'review') return
    const editing = modal.review
    setBusy(true)
    const res = editing
      ? await updateWebsiteReview(editing.id, { title: revTitle, url: revUrl })
      : await createWebsiteReview({ title: revTitle, url: revUrl })
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setReviews(prev => (editing ? prev.map(r => (r.id === editing.id ? res.review! : r)) : [res.review!, ...prev]))
    toast.success(editing ? 'Review updated' : 'Review added to the website')
    setModal(null)
  }

  const toggleReview = async (r: WebsiteReviewRow) => {
    const next = !r.is_published
    setReviews(prev => prev.map(x => (x.id === r.id ? { ...x, is_published: next } : x)))
    const res = await setWebsiteReviewPublished(r.id, next)
    if (!res.success) {
      setReviews(prev => prev.map(x => (x.id === r.id ? { ...x, is_published: !next } : x)))
      return toast.error(res.error)
    }
    toast.success(next ? 'Review shown on the website' : 'Review hidden from the website')
  }

  const removeReview = async (r: WebsiteReviewRow) => {
    if (!confirm(`Delete the review "${r.title}"?`)) return
    const res = await deleteWebsiteReview(r.id)
    if (!res.success) return toast.error(res.error)
    setReviews(prev => prev.filter(x => x.id !== r.id))
    toast.success('Review deleted')
  }

  const pill = (active: boolean) =>
    `inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${active ? 'bg-[#0f1d33] text-white' : 'bg-white border border-[#e8ecf2] text-[#5a6a82] hover:text-[#0f1d33]'}`

  const selectedCrm = form?.crmProjectId ? crmById.get(form.crmProjectId) : undefined

  return (
    <div className="w-full overflow-x-hidden px-4 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl md:text-2xl font-bold text-[#0f1d33]">
            <Globe className="h-6 w-6 text-brand shrink-0" /> Website Projects
          </h1>
          <p className="mt-0.5 text-xs md:text-sm text-[#5a6a82]">
            What visitors see on the website&apos;s <Link href="/projects" target="_blank" className="font-semibold text-[#1e3a5f] underline underline-offset-2">Projects</Link>, <Link href="/gallery" target="_blank" className="font-semibold text-[#1e3a5f] underline underline-offset-2">Gallery</Link> and <Link href="/reviews" target="_blank" className="font-semibold text-[#1e3a5f] underline underline-offset-2">Reviews</Link> pages, and testimonials on the <Link href="/" target="_blank" className="font-semibold text-[#1e3a5f] underline underline-offset-2">home page</Link>. Downloads come from the documents on the CRM Projects page.
          </p>
        </div>
        {/* The four action buttons get their own row under the heading: 2 x 2 on phones, one line from tablet up */}
        {canEdit && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button onClick={() => openReview(null)} className={`${headerBtn} border border-[#e8ecf2] bg-white text-[#0f1d33] hover:bg-[#f3f5f8]`}><Star className="h-4 w-4 shrink-0 text-brand" /> Add Review</button>
            <button onClick={() => openTestimonial(null)} className={`${headerBtn} border border-[#e8ecf2] bg-white text-[#0f1d33] hover:bg-[#f3f5f8]`}><Quote className="h-4 w-4 shrink-0 text-brand" /> Add Testimonial</button>
            <button onClick={() => openCategory(null)} className={`${headerBtn} border border-[#e8ecf2] bg-white text-[#0f1d33] hover:bg-[#f3f5f8]`}><Tag className="h-4 w-4 shrink-0 text-brand" /> Create Category</button>
            <button onClick={() => openProject(null)} className={`${headerBtn} bg-[#0f1d33] text-white hover:bg-[#1e3a5f]`}><Plus className="h-4 w-4 shrink-0" /> Create Project</button>
          </div>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load website projects: {loadError}. If this is a fresh setup, run <code className="font-mono">A_Requirements/supabase_schema.sql</code> in Supabase.</span>
        </div>
      )}

      {/* Search + live storage */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="flex-1 rounded-xl border border-[#e8ecf2] bg-white p-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a99ad]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects, locations, tags, points, reviews or testimonials" className={`${inputCls} pl-9`} aria-label="Search website projects" />
          </div>
        </div>
        <StorageIndicator refreshKey={storageKey} />
      </div>

      {/* Categories (priority order) */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setCategoryFilter('all')} className={pill(categoryFilter === 'all')}>All</button>
        {categories.map(c => (
          <div key={c.id} className="flex shrink-0 items-center">
            <button onClick={() => setCategoryFilter(c.id)} className={pill(categoryFilter === c.id)} title={`Priority ${c.priority}`}>
              <span className={`rounded px-1 text-[10px] ${categoryFilter === c.id ? 'bg-white/20' : 'bg-[#f3f5f8]'}`}>{c.priority}</span>
              {c.name}
            </button>
          </div>
        ))}
      </div>

      {/* Project groups */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e8ecf2] bg-white py-16 text-center">
          <Globe className="h-8 w-8 text-[#8a99ad]" />
          <p className="text-sm font-semibold text-[#0f1d33]">{search ? 'No matching projects' : 'No website projects yet'}</p>
          <p className="px-4 text-xs text-[#8a99ad]">{canEdit ? 'Create a category (e.g. Bangalore Highway), then create a project in it.' : 'Website projects will appear here.'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ category, projects: list }) => (
            <section key={category.id}>
              <div className="mb-2 flex items-center gap-1">
                <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-[#0f1d33]">
                  <span className="truncate">{category.name}</span>
                  <span className="shrink-0 rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">Priority {category.priority}</span>
                </h2>
                {canEdit && (
                  <>
                    <button onClick={() => openCategory(category)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={`Edit category ${category.name}`} title="Edit category"><Pencil className="h-4 w-4 text-[#8a99ad]" /></button>
                    <button onClick={() => removeCategory(category)} className={`${iconBtn} hover:bg-red-50`} aria-label={`Delete category ${category.name}`} title="Delete category"><Trash2 className="h-4 w-4 text-red-400" /></button>
                  </>
                )}
              </div>
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#e8ecf2] bg-white p-4 text-xs text-[#8a99ad]">No projects in this category yet.</p>
              ) : (
                <HScroller label={`${category.name} projects`}>
                  {list.map(p => (
                    <article key={p.id} className="flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#e8ecf2] bg-white shadow-xs sm:w-80">
                      <div className="relative aspect-video bg-[#0f1d33]">
                        {p.youtube_id ? (
                          <>
                            <img src={youtubeThumbUrl(p.youtube_id)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff0000] text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                          </>
                        ) : p.video_url ? (
                          <video src={p.video_url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-white/60"><Video className="mr-1.5 h-4 w-4" /> No video</div>
                        )}
                        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${p.is_published ? 'bg-emerald-500 text-white' : 'bg-white/90 text-[#5a6a82]'}`}>
                          {p.is_published ? 'LIVE' : 'HIDDEN'}
                        </span>
                        {p.images.length > 0 && (canEdit ? (
                          // Photo symbol = this project has pictures. Click it to edit them.
                          <button
                            type="button"
                            onClick={() => openProject(p, 'images')}
                            className="absolute right-2 top-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-black/65 px-3 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                            aria-label={`Edit the ${p.images.length} picture${p.images.length === 1 ? '' : 's'} of ${p.title}`}
                            title={`${p.images.length} picture${p.images.length === 1 ? '' : 's'}: click to edit`}
                          >
                            <Images className="h-4 w-4" aria-hidden /> {p.images.length}
                          </button>
                        ) : (
                          <span className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white" title={`${p.images.length} pictures`}><Images className="h-4 w-4" aria-hidden /> {p.images.length}</span>
                        ))}
                      </div>
                      <div className="flex flex-1 flex-col p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-[#0f1d33]" title={p.title}>{p.title}</h3>
                            {p.location && <p className="truncate text-xs text-[#5a6a82]">{p.location}</p>}
                          </div>
                          {canEdit && (
                            <div className="flex shrink-0 items-center">
                              <PublishToggle on={p.is_published} onChange={() => togglePublished(p)} label="Show on website" />
                              <button onClick={() => openProject(p)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={`Edit ${p.title}`} title="Edit"><Pencil className="h-4 w-4 text-[#5a6a82]" /></button>
                              <button onClick={() => removeProject(p)} className={`${iconBtn} hover:bg-red-50`} aria-label={`Delete ${p.title}`} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></button>
                            </div>
                          )}
                        </div>
                        {p.points.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {p.points.map((pt, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-[#0f1d33]"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" /><span className="line-clamp-1">{pt}</span></li>
                            ))}
                          </ul>
                        )}
                        {p.document_ids.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {p.document_ids.map(id => (
                              <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#e8ecf2] px-2 py-1 text-[11px] font-semibold text-[#1e3a5f]">
                                <Download className="h-3 w-3 shrink-0" /><span className="truncate">{docName(id)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </HScroller>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Testimonials (home page) */}
      {(testimonials.length > 0 || canEdit) && (
        <section className="mt-8" aria-labelledby="testimonials-heading">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="testimonials-heading" className="flex items-center gap-2 text-sm font-bold text-[#0f1d33]">
              <Quote className="h-4 w-4 text-brand" /> Testimonials <span className="font-normal text-[#8a99ad]">(home page)</span>
              <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">{testimonials.length}</span>
            </h2>
          </div>
          {filteredTestimonials.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#e8ecf2] bg-white p-4 text-xs text-[#8a99ad]">{search ? 'No matching testimonials.' : canEdit ? 'No testimonials yet. Use "Add Testimonial" to add a YouTube link or an MP4 video. The home page section appears once you add one.' : 'No testimonials yet.'}</p>
          ) : (
            <HScroller label="Testimonials">
              {filteredTestimonials.map(t => (
                <article key={t.id} className="flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#e8ecf2] bg-white shadow-xs sm:w-80">
                  <div className="relative aspect-video bg-black">
                    {t.youtube_id ? (
                      <>
                        <img src={youtubeThumbUrl(t.youtube_id)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff0000] text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                      </>
                    ) : (
                      <video src={t.video_url!} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain" />
                    )}
                    <span className={`pointer-events-none absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${t.is_published ? 'bg-emerald-500 text-white' : 'bg-white/90 text-[#5a6a82]'}`}>{t.is_published ? 'LIVE' : 'HIDDEN'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2 p-3">
                    <h3 className="min-w-0 flex-1 break-words text-sm font-bold text-[#0f1d33]" title={t.title}>{t.title}</h3>
                    {canEdit && (
                      <div className="flex shrink-0 items-center">
                        <PublishToggle on={t.is_published} onChange={() => toggleTestimonial(t)} label="Show testimonial on home page" />
                        <button onClick={() => openTestimonial(t)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={`Edit ${t.title}`} title="Edit"><Pencil className="h-4 w-4 text-[#5a6a82]" /></button>
                        <button onClick={() => removeTestimonial(t)} className={`${iconBtn} hover:bg-red-50`} aria-label={`Delete ${t.title}`} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </HScroller>
          )}
        </section>
      )}

      {/* Reviews (YouTube) */}
      {(reviews.length > 0 || canEdit) && (
        <section className="mt-8" aria-labelledby="reviews-heading">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="reviews-heading" className="flex items-center gap-2 text-sm font-bold text-[#0f1d33]">
              <Star className="h-4 w-4 text-brand" /> Reviews
              <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">{reviews.length}</span>
            </h2>
          </div>
          {filteredReviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#e8ecf2] bg-white p-4 text-xs text-[#8a99ad]">{search ? 'No matching reviews.' : canEdit ? 'No reviews yet. Use "Add Review" to add a YouTube video.' : 'No reviews yet.'}</p>
          ) : (
            <HScroller label="Reviews">
              {filteredReviews.map(r => (
                <article key={r.id} className="flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#e8ecf2] bg-white shadow-xs sm:w-80">
                  <a href={youtubeWatchUrl(r.youtube_id)} target="_blank" rel="noopener noreferrer" className="relative block aspect-video bg-black" aria-label={`Open ${r.title} on YouTube`}>
                    <img src={youtubeThumbUrl(r.youtube_id)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff0000] text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.is_published ? 'bg-emerald-500 text-white' : 'bg-white/90 text-[#5a6a82]'}`}>{r.is_published ? 'LIVE' : 'HIDDEN'}</span>
                  </a>
                  <div className="flex items-start justify-between gap-2 p-3">
                    <h3 className="min-w-0 flex-1 break-words text-sm font-bold text-[#0f1d33]" title={r.title}>{r.title}</h3>
                    {canEdit && (
                      <div className="flex shrink-0 items-center">
                        <PublishToggle on={r.is_published} onChange={() => toggleReview(r)} label="Show review on website" />
                        <button onClick={() => openReview(r)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={`Edit ${r.title}`} title="Edit"><Pencil className="h-4 w-4 text-[#5a6a82]" /></button>
                        <button onClick={() => removeReview(r)} className={`${iconBtn} hover:bg-red-50`} aria-label={`Delete ${r.title}`} title="Delete"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </HScroller>
          )}
        </section>
      )}

      {/* Testimonial modal */}
      {modal?.type === 'testimonial' && (
        <Modal title={modal.item ? 'Edit Testimonial' : 'Add Testimonial'} onClose={closeModal}>
          <form onSubmit={submitTestimonial} className="flex flex-col gap-3">
            <LimitedInput label="Title (who or what the video is about)" required max={WEBSITE_TESTIMONIAL_TITLE_MAX_CHARS} value={tTitle} onChange={setTTitle} placeholder="e.g. Mr. Rao, plot owner at Shadnagar" />

            <div>
              <p className={labelCls}>Video</p>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-[#f3f5f8] p-1" role="tablist" aria-label="Video source">
                {(['youtube', 'video'] as const).map(m => (
                  <button key={m} type="button" role="tab" aria-selected={tMode === m} onClick={() => setTMode(m)}
                    className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md text-xs font-semibold cursor-pointer ${tMode === m ? 'bg-white text-[#0f1d33] shadow-xs' : 'text-[#5a6a82]'}`}>
                    {m === 'youtube' ? <><Link2 className="h-4 w-4" /> YouTube link</> : <><Upload className="h-4 w-4" /> Upload MP4</>}
                  </button>
                ))}
              </div>

              {tMode === 'youtube' ? (
                <div className="mt-2">
                  <label className={labelCls}>YouTube video link
                    <input type="url" value={tUrl} onChange={(e) => setTUrl(e.target.value.slice(0, 300))} placeholder="https://www.youtube.com/watch?v=..." className={`${inputCls} mt-1`} />
                  </label>
                  {tUrl.trim() !== '' && (() => {
                    const yid = parseYouTubeId(tUrl)
                    return yid ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-[#e8ecf2]">
                        <div className="relative aspect-video bg-black">
                          <img src={youtubeThumbUrl(yid)} alt="YouTube preview" className="absolute inset-0 h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff0000] text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                        </div>
                        <p className="p-2 text-[11px] text-[#5a6a82]">Preview. Visitors play it on the home page. {modal.item?.video_url ? 'The uploaded MP4 is removed when you save, to free storage.' : 'No storage used.'}</p>
                      </div>
                    ) : <p className="mt-1 text-[11px] font-semibold text-red-600">That is not a valid YouTube video link.</p>
                  })()}
                </div>
              ) : (tPreview || tCurrent) ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-[#e8ecf2]">
                  <video src={tPreview || tCurrent || undefined} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <span className="min-w-0 truncate text-xs text-[#5a6a82]">{tFile ? tFile.name : 'Current video'}</span>
                    <label className={`${secondaryBtn} min-h-[40px] shrink-0 px-3 text-xs`}>
                      <Upload className="h-4 w-4" /> Replace
                      <input type="file" accept="video/mp4,.mp4" className="sr-only" onChange={(e) => { pickTestimonialVideo(e.target.files?.[0] || null); e.target.value = '' }} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="mt-2 flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#e8ecf2] bg-[#f8fafc] p-4 text-center hover:border-brand">
                  <Video className="h-6 w-6 text-[#8a99ad]" />
                  <span className="text-xs text-[#5a6a82]">Tap to choose an MP4 video (max 45 MB)</span>
                  <input type="file" accept="video/mp4,.mp4" className="sr-only" onChange={(e) => { pickTestimonialVideo(e.target.files?.[0] || null); e.target.value = '' }} />
                </label>
              )}
            </div>

            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? busyLabel || 'Saving…' : modal.item ? 'Save Testimonial' : 'Add Testimonial'}</button>
          </form>
        </Modal>
      )}

      {/* Review modal */}
      {modal?.type === 'review' && (
        <Modal title={modal.review ? 'Edit Review' : 'Add Review'} onClose={closeModal}>
          <form onSubmit={submitReview} className="flex flex-col gap-3">
            <LimitedInput label="Review title (what the video is about)" required max={WEBSITE_REVIEW_TITLE_MAX_CHARS} value={revTitle} onChange={setRevTitle} placeholder="e.g. Customer review: Arudra Exotica Villas" />
            <LimitedInput label="YouTube video link" type="url" required max={300} value={revUrl} onChange={setRevUrl} placeholder="https://www.youtube.com/watch?v=..." />
            {revUrl.trim() !== '' && (() => {
              const yid = parseYouTubeId(revUrl)
              return yid ? (
                <div className="overflow-hidden rounded-lg border border-[#e8ecf2]">
                  <div className="relative aspect-video bg-black">
                    <img src={youtubeThumbUrl(yid)} alt="YouTube preview" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff0000] text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                  </div>
                  <p className="p-2 text-[11px] text-[#5a6a82]">Preview. Visitors play it on the website Reviews page.</p>
                </div>
              ) : <p className="text-[11px] font-semibold text-red-600">That is not a valid YouTube video link. Use youtube.com/watch, youtu.be or a Shorts link.</p>
            })()}
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {modal.review ? 'Save Review' : 'Add Review'}</button>
          </form>
        </Modal>
      )}

      {/* Category modal */}
      {modal?.type === 'category' && (
        <Modal title={modal.category ? 'Edit Category' : 'Create Category'} onClose={closeModal}>
          <form onSubmit={submitCategory} className="flex flex-col gap-3">
            <label className={labelCls}>Category name
              <input autoFocus required maxLength={80} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Bangalore Highway" className={`${inputCls} mt-1`} />
            </label>
            <label className={labelCls}>Priority
              <input required type="number" inputMode="numeric" min={1} max={9999} step={1} value={catPriority} onChange={(e) => setCatPriority(e.target.value)} className={`${inputCls} mt-1`} />
              <span className="mt-1 block text-[11px] font-normal text-[#8a99ad]">1 shows first on the website, then 2, 3 and so on.</span>
            </label>
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {modal.category ? 'Save' : 'Create Category'}</button>
          </form>
        </Modal>
      )}

      {/* Project modal */}
      {modal?.type === 'project' && form && (
        <Modal title={form.id ? 'Edit Website Project' : 'Create Website Project'} onClose={closeModal} wide>
          <form onSubmit={submitProject} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={labelCls}>Category
                <select required value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className={`${inputCls} mt-1 cursor-pointer`}>
                  <option value="" disabled>Choose a category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <LimitedInput label="Project title" required max={WEBSITE_TITLE_MAX_CHARS} value={form.title} onChange={(v) => set({ title: v })} placeholder="e.g. Arudra Exotica Earthstay Villas" />
              <LimitedInput label="Location line" max={WEBSITE_LOCATION_MAX_CHARS} value={form.location} onChange={(v) => set({ location: v })} placeholder="e.g. Bangalore Highway near Kothur" />
              <TagsInput value={form.tags} onChange={(v) => set({ tags: v })} />
            </div>

            {/* Video: upload an MP4, or paste a YouTube link (saves storage) */}
            <div>
              <p className={labelCls}>Project video</p>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-[#f3f5f8] p-1" role="tablist" aria-label="Video source">
                {(['upload', 'youtube'] as const).map(m => (
                  <button key={m} type="button" role="tab" aria-selected={form.videoMode === m} onClick={() => set({ videoMode: m })}
                    className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md text-xs font-semibold cursor-pointer ${form.videoMode === m ? 'bg-white text-[#0f1d33] shadow-xs' : 'text-[#5a6a82]'}`}>
                    {m === 'upload' ? <><Upload className="h-4 w-4" /> Upload MP4</> : <><Link2 className="h-4 w-4" /> YouTube link</>}
                  </button>
                ))}
              </div>

              {form.videoMode === 'youtube' ? (
                <div className="mt-2">
                  <LimitedInput label="YouTube video link" type="url" max={300} value={form.youtubeUrl} onChange={(v) => set({ youtubeUrl: v })} placeholder="https://www.youtube.com/watch?v=..." />
                  {form.youtubeUrl.trim() !== '' && (() => {
                    const yid = parseYouTubeId(form.youtubeUrl)
                    return yid ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-[#e8ecf2]">
                        <div className="relative aspect-video bg-black">
                          <img src={youtubeThumbUrl(yid)} alt="YouTube preview" className="absolute inset-0 h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff0000] text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
                        </div>
                        <p className="p-2 text-[11px] text-[#5a6a82]">Preview. Visitors play it on the website. {form.currentVideoUrl ? 'The uploaded MP4 is removed when you save, to free storage.' : 'No storage used.'}</p>
                      </div>
                    ) : <p className="mt-1 text-[11px] font-semibold text-red-600">That is not a valid YouTube video link.</p>
                  })()}
                </div>
              ) : (form.videoPreview || (form.currentVideoUrl && !form.removeVideo)) ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-[#e8ecf2]">
                  <video src={form.videoPreview || form.currentVideoUrl || undefined} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <span className="min-w-0 truncate text-xs text-[#5a6a82]">{form.videoFile ? form.videoFile.name : 'Current video'}</span>
                    <div className="flex shrink-0 gap-1">
                      <label className={`${secondaryBtn} min-h-[40px] px-3 text-xs`}>
                        <Upload className="h-4 w-4" /> Replace
                        <input type="file" accept="video/mp4,.mp4" className="sr-only" onChange={(e) => pickVideo(e.target.files?.[0] || null)} />
                      </label>
                      <button type="button" onClick={() => set({ videoFile: null, videoPreview: null, removeVideo: !!form.currentVideoUrl })} className={`${secondaryBtn} min-h-[40px] px-3 text-xs text-red-600`}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <label className="mt-2 flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#e8ecf2] bg-[#f8fafc] p-4 text-center hover:border-brand">
                  <Video className="h-6 w-6 text-[#8a99ad]" />
                  <span className="text-xs text-[#5a6a82]">Tap to choose an MP4 video (max 45 MB)</span>
                  <input type="file" accept="video/mp4,.mp4" className="sr-only" onChange={(e) => pickVideo(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>

            {/* Points */}
            <div>
              <p className={labelCls}>Points (up to {WEBSITE_MAX_POINTS}, {WEBSITE_POINT_MAX_CHARS} characters each)</p>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {form.points.map((pt, i) => {
                  const left = WEBSITE_POINT_MAX_CHARS - pt.length
                  const tone = countTone(left, 10)
                  return (
                    <div key={i} className="relative">
                      <CheckCircle2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
                      <input
                        maxLength={WEBSITE_POINT_MAX_CHARS}
                        value={pt}
                        onChange={(e) => set({ points: form.points.map((x, j) => (j === i ? e.target.value.slice(0, WEBSITE_POINT_MAX_CHARS) : x)) })}
                        placeholder={`Point ${i + 1}`}
                        className={`${inputCls} pl-9 pr-12`}
                        aria-label={`Point ${i + 1}`}
                        aria-describedby={`point-left-${i}`}
                      />
                      <span id={`point-left-${i}`} aria-live="polite" className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums ${tone}`} title="Characters left">
                        {left}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Downloads */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={labelCls}>CRM project (documents come from here)
                <select value={form.crmProjectId} onChange={(e) => set({ crmProjectId: e.target.value, documentIds: [] })} className={`${inputCls} mt-1 cursor-pointer`}>
                  <option value="">None</option>
                  {crmProjects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.documents.filter(isWebsiteDownloadable).length} PDFs)</option>)}
                </select>
              </label>
              <div className={labelCls}>Downloads (PDF only, max 25 MB, up to {WEBSITE_MAX_DOWNLOADS})
                <div className="mt-1">
                  <DocumentPicker documents={(selectedCrm?.documents || []).filter(isWebsiteDownloadable)} selected={form.documentIds} onChange={(ids) => set({ documentIds: ids })} disabled={!selectedCrm} />
                </div>
              </div>
            </div>
            {form.documentIds.length > 0 && (
              <div className="-mt-2 flex flex-wrap gap-2" aria-label="Download buttons preview">
                {form.documentIds.map(id => (
                  <span key={id} className="inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-lg border border-[#e8ecf2] bg-white pl-3 text-xs font-semibold text-[#0f1d33]">
                    <Download className="h-3.5 w-3.5 shrink-0 text-[#1e3a5f]" /><span className="truncate">{docName(id)}</span>
                    <button type="button" onClick={() => set({ documentIds: form.documentIds.filter(x => x !== id) })} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label={`Remove ${docName(id)}`}>
                      <X className="h-3.5 w-3.5 text-[#8a99ad]" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* More videos: only the main video above shows on the Projects page; these show on the Gallery page */}
            <div>
              <p className={`${labelCls} flex items-center justify-between gap-2`}>
                <span>More videos (Gallery page)</span>
                <span className="shrink-0 tabular-nums text-[#8a99ad]">{extraCount} of {WEBSITE_PROJECT_EXTRA_VIDEOS_MAX}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-[#8a99ad]">The main video above is the only one shown on the Projects page. These, together with it, show on the Gallery page.</p>

              {(form.extraVideos.length > 0 || form.newVideos.length > 0) && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {form.extraVideos.map(v => (
                    <div key={v.id} className="relative aspect-video overflow-hidden rounded-lg border border-[#e8ecf2] bg-black">
                      {v.youtube_id ? (
                        <><img src={youtubeThumbUrl(v.youtube_id)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-black/25"><Play className="h-6 w-6 fill-white text-white" /></span></>
                      ) : (
                        <video src={v.video_url!} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
                      )}
                      <button type="button" onClick={() => removeSavedVideo(v)} className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 cursor-pointer" aria-label="Delete video"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {form.newVideos.map(v => (
                    <div key={v.key} className="relative aspect-video overflow-hidden rounded-lg border-2 border-dashed border-brand bg-black">
                      {v.kind === 'youtube' ? (
                        <><img src={youtubeThumbUrl(v.id!)} alt="" className="absolute inset-0 h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-black/25"><Play className="h-6 w-6 fill-white text-white" /></span></>
                      ) : (
                        <video src={v.preview} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
                      )}
                      <span className="absolute bottom-1 left-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">NEW</span>
                      <button type="button" onClick={() => dropNewVideo(v.key)} className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 cursor-pointer" aria-label="Remove video"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {extraCount < WEBSITE_PROJECT_EXTRA_VIDEOS_MAX && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    value={form.ytDraft}
                    onChange={(e) => set({ ytDraft: e.target.value.slice(0, 300) })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stageYoutube() } }}
                    placeholder="Paste a YouTube link"
                    aria-label="YouTube link for an extra video"
                    className={`${inputCls} min-w-0 flex-1`}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <button type="button" onClick={stageYoutube} className={`${secondaryBtn} whitespace-nowrap`}><Link2 className="h-4 w-4" /> Add link</button>
                    <label className={`${secondaryBtn} cursor-pointer whitespace-nowrap`}>
                      <Upload className="h-4 w-4" /> Add MP4
                      <input type="file" multiple accept="video/mp4,.mp4" className="sr-only" onChange={(e) => { stageMp4s(e.target.files); e.target.value = '' }} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Project pictures (shown on the website Gallery page) */}
            <div id="project-pictures" className="scroll-mt-16">
              <p className={`${labelCls} flex items-center justify-between gap-2`}>
                <span>Upload project pictures (Gallery page)</span>
                <span className="shrink-0 tabular-nums text-[#8a99ad]">{form.images.length + form.newImages.length} of {WEBSITE_GALLERY_MAX_IMAGES}</span>
              </p>
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {form.images.map(img => (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-lg border border-[#e8ecf2] bg-[#f3f5f8]">
                    <img src={img.thumb_url} alt="Project picture" loading="lazy" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => removeSavedImage(img)} className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 cursor-pointer" aria-label="Delete picture"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {form.newImages.map(img => (
                  <div key={img.key} className="relative aspect-square overflow-hidden rounded-lg border-2 border-dashed border-brand bg-[#f3f5f8]">
                    <img src={img.preview} alt="New picture" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-brand px-1.5 py-0.5 text-[9px] font-bold text-white">NEW</span>
                    <button type="button" onClick={() => dropNewImage(img.key)} className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 cursor-pointer" aria-label="Remove picture"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {form.images.length + form.newImages.length < WEBSITE_GALLERY_MAX_IMAGES && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#e8ecf2] bg-[#f8fafc] text-center hover:border-brand">
                    <ImagePlus className="h-6 w-6 text-[#8a99ad]" />
                    <span className="px-1 text-[11px] text-[#5a6a82]">Add pictures</span>
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pickImages(e.target.files); e.target.value = '' }} />
                  </label>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[#8a99ad]">JPG, PNG or WebP, up to {WEBSITE_GALLERY_MAX_IMAGES} per project. Big photos are shrunk automatically. They are saved when you press Save.</p>
            </div>

            <LimitedInput label="Location link (optional, e.g. Google Maps)" type="url" max={WEBSITE_MAP_URL_MAX_CHARS} value={form.mapUrl} onChange={(v) => set({ mapUrl: v })} placeholder="https://maps.google.com/..." />

            <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-[#e8ecf2] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {busy ? busyLabel || 'Saving…' : form.id ? 'Save Changes' : 'Save Project'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
