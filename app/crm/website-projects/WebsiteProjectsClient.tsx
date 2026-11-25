'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Globe, Plus, X, Search, Loader2, Trash2, Pencil, Tag, Video, Upload, Download, ChevronDown,
  CheckCircle2, AlertTriangle, Eye, EyeOff, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { StorageIndicator } from '@/components/StorageIndicator'
import {
  WEBSITE_MAX_DOWNLOADS, WEBSITE_MAX_POINTS, WEBSITE_POINT_MAX_CHARS, WEBSITE_MAX_VIDEO_BYTES, WEBSITE_MEDIA_BUCKET,
  WEBSITE_TITLE_MAX_CHARS, WEBSITE_LOCATION_MAX_CHARS, WEBSITE_MAX_TAGS, WEBSITE_TAG_MAX_CHARS, WEBSITE_MAP_URL_MAX_CHARS, splitTags,
} from '@/lib/website-projects-shared'
import {
  createWebsiteCategory, updateWebsiteCategory, deleteWebsiteCategory, createWebsiteVideoUpload,
  saveWebsiteProject, setWebsiteProjectPublished, deleteWebsiteProject,
  type WebsiteCategory, type WebsiteProjectRow, type CrmProjectOption,
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
      ? 'This project has no documents yet'
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
  videoFile: File | null
  videoPreview: string | null
  currentVideoUrl: string | null
  removeVideo: boolean
}

const emptyPoints = () => Array.from({ length: WEBSITE_MAX_POINTS }, () => '')

export default function WebsiteProjectsClient({
  initialCategories, initialProjects, crmProjects, loadError, canEdit,
}: {
  initialCategories: WebsiteCategory[]
  initialProjects: WebsiteProjectRow[]
  crmProjects: CrmProjectOption[]
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
  const [modal, setModal] = useState<null | { type: 'category'; category: WebsiteCategory | null } | { type: 'project' }>(null)

  const [catName, setCatName] = useState('')
  const [catPriority, setCatPriority] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const set = (patch: Partial<FormState>) => setForm(f => (f ? { ...f, ...patch } : f))

  // Free the local video preview when it changes or the modal closes
  useEffect(() => () => { if (form?.videoPreview) URL.revokeObjectURL(form.videoPreview) }, [form?.videoPreview])

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

  const closeModal = () => { if (!busy) { setModal(null); setForm(null) } }

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
  const openProject = (p: WebsiteProjectRow | null) => {
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
      videoFile: null,
      videoPreview: null,
      currentVideoUrl: p?.video_url || null,
      removeVideo: false,
    })
    setModal({ type: 'project' })
  }

  const pickVideo = (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('video/')) return void toast.error('Please choose a video file.')
    if (file.size > WEBSITE_MAX_VIDEO_BYTES) return void toast.error('The video must be 50 MB or smaller.')
    set({ videoFile: file, videoPreview: URL.createObjectURL(file), removeVideo: false })
  }

  const submitProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (!form.categoryId) return toast.error('Choose a category.')
    if (!form.title.trim()) return toast.error('Project title is required.')
    const tagList = splitTags(form.tags)
    if (tagList.length > WEBSITE_MAX_TAGS) return toast.error(`Only ${WEBSITE_MAX_TAGS} tags are allowed.`)
    if (tagList.some(t => t.length > WEBSITE_TAG_MAX_CHARS)) return toast.error(`Each tag can be up to ${WEBSITE_TAG_MAX_CHARS} characters.`)

    setBusy(true)
    try {
      let video: { path: string; mimeType: string; sizeBytes: number } | null = null
      if (form.videoFile) {
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
        removeVideo: form.removeVideo,
      })
      if (!res.success) return void toast.error(res.error)
      const saved = res.project!
      setProjects(prev => (form.id ? prev.map(p => (p.id === saved.id ? saved : p)) : [saved, ...prev]))
      if (video || form.removeVideo) refreshStorage()
      toast.success(form.id ? 'Website project updated' : `"${saved.title}" is saved${saved.is_published ? ' and live on the website' : ''}`)
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

  const pill = (active: boolean) =>
    `inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${active ? 'bg-[#0f1d33] text-white' : 'bg-white border border-[#e8ecf2] text-[#5a6a82] hover:text-[#0f1d33]'}`

  const selectedCrm = form?.crmProjectId ? crmById.get(form.crmProjectId) : undefined

  return (
    <div className="w-full overflow-x-hidden px-4 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl md:text-2xl font-bold text-[#0f1d33]">
            <Globe className="h-6 w-6 text-brand shrink-0" /> Website Projects
          </h1>
          <p className="mt-0.5 text-xs md:text-sm text-[#5a6a82]">
            What visitors see on the website&apos;s <Link href="/projects" target="_blank" className="font-semibold text-[#1e3a5f] underline underline-offset-2">Projects page</Link>. Downloads come from the documents on the CRM Projects page.
          </p>
        </div>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects, locations, tags or points" className={`${inputCls} pl-9`} aria-label="Search website projects" />
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
            {canEdit && categoryFilter === c.id && (
              <>
                <button onClick={() => openCategory(c)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={`Edit ${c.name}`} title="Edit category"><Pencil className="h-4 w-4 text-[#5a6a82]" /></button>
                <button onClick={() => removeCategory(c)} className={`${iconBtn} hover:bg-red-50`} aria-label={`Delete ${c.name}`} title="Delete category"><Trash2 className="h-4 w-4 text-red-500" /></button>
              </>
            )}
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
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#0f1d33]">
                {category.name}
                <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">Priority {category.priority}</span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#e8ecf2] bg-white p-4 text-xs text-[#8a99ad]">No projects in this category yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 md:gap-4">
                  {list.map(p => (
                    <article key={p.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e8ecf2] bg-white shadow-xs">
                      <div className="relative aspect-video bg-[#0f1d33]">
                        {p.video_url ? (
                          <video src={p.video_url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-white/60"><Video className="mr-1.5 h-4 w-4" /> No video</div>
                        )}
                        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${p.is_published ? 'bg-emerald-500 text-white' : 'bg-white/90 text-[#5a6a82]'}`}>
                          {p.is_published ? 'LIVE' : 'HIDDEN'}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-[#0f1d33]" title={p.title}>{p.title}</h3>
                            {p.location && <p className="truncate text-xs text-[#5a6a82]">{p.location}</p>}
                          </div>
                          {canEdit && (
                            <div className="flex shrink-0 items-center">
                              <button onClick={() => togglePublished(p)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={p.is_published ? 'Hide from website' : 'Show on website'} title={p.is_published ? 'Hide from website' : 'Show on website'}>
                                {p.is_published ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-[#8a99ad]" />}
                              </button>
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
                </div>
              )}
            </section>
          ))}
        </div>
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

            {/* Video */}
            <div>
              <p className={labelCls}>Video (1 video, max 50 MB)</p>
              {(form.videoPreview || (form.currentVideoUrl && !form.removeVideo)) ? (
                <div className="mt-1 overflow-hidden rounded-lg border border-[#e8ecf2]">
                  <video src={form.videoPreview || form.currentVideoUrl || undefined} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <span className="min-w-0 truncate text-xs text-[#5a6a82]">{form.videoFile ? form.videoFile.name : 'Current video'}</span>
                    <div className="flex shrink-0 gap-1">
                      <label className={`${secondaryBtn} min-h-[40px] px-3 text-xs`}>
                        <Upload className="h-4 w-4" /> Replace
                        <input type="file" accept="video/*" className="sr-only" onChange={(e) => pickVideo(e.target.files?.[0] || null)} />
                      </label>
                      <button type="button" onClick={() => set({ videoFile: null, videoPreview: null, removeVideo: !!form.currentVideoUrl })} className={`${secondaryBtn} min-h-[40px] px-3 text-xs text-red-600`}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <label className="mt-1 flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#e8ecf2] bg-[#f8fafc] p-4 text-center hover:border-brand">
                  <Video className="h-6 w-6 text-[#8a99ad]" />
                  <span className="text-xs text-[#5a6a82]">Tap to choose a video (MP4 works best)</span>
                  <input type="file" accept="video/*" className="sr-only" onChange={(e) => pickVideo(e.target.files?.[0] || null)} />
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
                  {crmProjects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.documents.length})</option>)}
                </select>
              </label>
              <div className={labelCls}>Downloads (up to {WEBSITE_MAX_DOWNLOADS})
                <div className="mt-1">
                  <DocumentPicker documents={selectedCrm?.documents || []} selected={form.documentIds} onChange={(ids) => set({ documentIds: ids })} disabled={!selectedCrm} />
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

            <LimitedInput label="Location link (optional, e.g. Google Maps)" type="url" max={WEBSITE_MAP_URL_MAX_CHARS} value={form.mapUrl} onChange={(v) => set({ mapUrl: v })} placeholder="https://maps.google.com/..." />

            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[#e8ecf2] px-3">
              <input type="checkbox" checked={form.isPublished} onChange={(e) => set({ isPublished: e.target.checked })} className="h-4 w-4 accent-[#0f1d33]" />
              <span className="text-sm font-semibold text-[#0f1d33]">Show on the website</span>
            </label>

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
