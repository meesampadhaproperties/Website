'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FolderKanban, MapPin, Plus, X, Search, FilePlus2, Link2, Upload, Loader2, Trash2,
  ExternalLink, Pencil, FileText, Image as ImageIcon, Video, Music, FileArchive, AlertTriangle, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { StorageIndicator } from '@/components/StorageIndicator'
import { createClient } from '@/lib/supabase/client'
import { DOCUMENT_NAME_MAX_CHARS } from '@/lib/project-documents'
import {
  createArea, renameArea, deleteArea, createWorkspaceProject, updateWorkspaceProject, deleteWorkspaceProject,
  setProjectArea, createLinkDocument, createDocumentUpload, finalizeDocumentUpload, getDocumentOpenUrl,
  renameDocument, deleteDocument,
  type ProjectArea, type ProjectDocument, type WorkspaceProject,
} from './actions'

const BUCKET = 'project-documents'
const MAX_FILE_BYTES = 50 * 1024 * 1024
const FILE_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip'
const UNASSIGNED = '__unassigned__'

const inputCls = 'w-full min-h-[44px] rounded-lg border border-[#e8ecf2] bg-[#f8fafc] px-3 text-sm text-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]'
const primaryBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer'
const secondaryBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#e8ecf2] bg-white px-4 text-sm font-semibold text-[#0f1d33] hover:bg-[#f3f5f8] transition-colors cursor-pointer'

function formatBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function DocIcon({ doc }: { doc: ProjectDocument }) {
  const cls = 'h-4 w-4 shrink-0'
  if (doc.doc_type === 'link') return <Link2 className={`${cls} text-blue-600`} />
  const m = doc.mime_type || ''
  if (m.startsWith('image/')) return <ImageIcon className={`${cls} text-emerald-600`} />
  if (m.startsWith('video/')) return <Video className={`${cls} text-purple-600`} />
  if (m.startsWith('audio/')) return <Music className={`${cls} text-pink-600`} />
  if (m.includes('zip')) return <FileArchive className={`${cls} text-amber-600`} />
  return <FileText className={`${cls} text-[#1e3a5f]`} />
}

/** Document name input with a live "characters left" countdown (names are website download labels). */
function DocNameInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const left = DOCUMENT_NAME_MAX_CHARS - value.length
  const tone = left <= 0 ? 'text-red-600' : left <= 5 ? 'text-amber-600' : 'text-[#8a99ad]'
  return (
    <label className="text-xs font-semibold text-[#5a6a82]">
      <span className="flex items-center justify-between gap-2">
        Document name
        <span aria-live="polite" className={`tabular-nums ${tone}`}>{left} characters left</span>
      </span>
      <input autoFocus={autoFocus} required maxLength={DOCUMENT_NAME_MAX_CHARS} value={value} onChange={(e) => onChange(e.target.value.slice(0, DOCUMENT_NAME_MAX_CHARS))} placeholder={placeholder} className={`${inputCls} mt-1`} />
    </label>
  )
}

/** Mobile bottom-sheet / desktop centered modal with backdrop scroll-lock and Esc to close */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e8ecf2] bg-white px-4 py-3">
          <h2 className="text-base font-bold text-[#0f1d33]">{title}</h2>
          <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label="Close">
            <X className="h-5 w-5 text-[#5a6a82]" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export default function ProjectsWorkspaceClient({
  initialAreas, initialProjects, loadError, canEdit,
}: {
  initialAreas: ProjectArea[]
  initialProjects: WorkspaceProject[]
  loadError: string | null
  canEdit: boolean
}) {
  const [areas, setAreas] = useState(initialAreas)
  const [projects, setProjects] = useState(initialProjects)
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [storageKey, setStorageKey] = useState(0)
  const refreshStorage = () => setStorageKey(k => k + 1)
  const [modal, setModal] = useState<
    | null
    | { type: 'area' } | { type: 'project' } | { type: 'document'; project: WorkspaceProject }
    | { type: 'editArea'; area: ProjectArea } | { type: 'editProject'; project: WorkspaceProject }
    | { type: 'editDocument'; doc: ProjectDocument }
  >(null)
  const [busy, setBusy] = useState(false)

  // Form state (shared across modals; reset on open)
  const [areaName, setAreaName] = useState('')
  const [projName, setProjName] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projArea, setProjArea] = useState('')
  const [docName, setDocName] = useState('')
  const [docMode, setDocMode] = useState<'file' | 'link'>('file')
  const [docUrl, setDocUrl] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)

  const selectedArea = areas.find(a => a.id === areaFilter) || null
  const areaName_ = (id: string | null) => areas.find(a => a.id === id)?.name
  const hasUnassigned = projects.some(p => !p.area_id || !areas.some(a => a.id === p.area_id))

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(p => {
      if (areaFilter === UNASSIGNED && p.area_id && areas.some(a => a.id === p.area_id)) return false
      if (areaFilter !== 'all' && areaFilter !== UNASSIGNED && p.area_id !== areaFilter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q) ||
        p.documents.some(d => d.name.toLowerCase().includes(q))
    })
  }, [projects, areas, areaFilter, search])

  const closeModal = () => { if (!busy) setModal(null) }

  const openArea = () => { setAreaName(''); setModal({ type: 'area' }) }
  const openProject = () => {
    setProjName(''); setProjClient('')
    setProjArea(areaFilter !== 'all' && areaFilter !== UNASSIGNED ? areaFilter : '')
    setModal({ type: 'project' })
  }
  const openDocument = (project: WorkspaceProject) => {
    setDocName(''); setDocUrl(''); setDocFile(null); setDocMode('file')
    setModal({ type: 'document', project })
  }

  const submitArea = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await createArea(areaName)
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setAreas(prev => [...prev, res.area].sort((a, b) => a.name.localeCompare(b.name)))
    toast.success(`Area "${res.area.name}" created`)
    setModal(null)
  }

  const removeArea = async (area: ProjectArea) => {
    if (!confirm(`Delete area "${area.name}"? Its projects will move to "Unassigned".`)) return
    const res = await deleteArea(area.id)
    if (!res.success) return toast.error(res.error)
    setAreas(prev => prev.filter(a => a.id !== area.id))
    setProjects(prev => prev.map(p => (p.area_id === area.id ? { ...p, area_id: null } : p)))
    if (areaFilter === area.id) setAreaFilter('all')
    toast.success('Area deleted')
  }

  const submitProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await createWorkspaceProject({ name: projName, clientName: projClient, areaId: projArea || null })
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setProjects(prev => [...prev, res.project].sort((a, b) => a.name.localeCompare(b.name)))
    toast.success(`Project "${res.project.name}" created`)
    setModal(null)
  }

  const changeProjectArea = async (project: WorkspaceProject, areaId: string) => {
    const prevArea = project.area_id
    setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, area_id: areaId || null } : p)))
    const res = await setProjectArea(project.id, areaId || null)
    if (!res.success) {
      setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, area_id: prevArea } : p)))
      toast.error(res.error)
    }
  }

  const addDocToState = (doc: ProjectDocument) =>
    setProjects(prev => prev.map(p => (p.id === doc.project_id ? { ...p, documents: [doc, ...p.documents] } : p)))

  const submitDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'document') return
    const project = modal.project
    if (!docName.trim()) return toast.error('Document name is required.')

    setBusy(true)
    try {
      if (docMode === 'link') {
        const res = await createLinkDocument({ projectId: project.id, name: docName, url: docUrl })
        if (!res.success) return void toast.error(res.error)
        addDocToState(res.document)
      } else {
        if (!docFile) return void toast.error('Choose a file to upload.')
        if (docFile.size > MAX_FILE_BYTES) return void toast.error('Files must be 50 MB or smaller.')
        const mimeType = docFile.type || 'application/octet-stream'

        const start = await createDocumentUpload({ projectId: project.id, fileName: docFile.name, mimeType, sizeBytes: docFile.size })
        if (!start.success) return void toast.error(start.error)

        const { error: upErr } = await createClient().storage.from(BUCKET)
          .uploadToSignedUrl(start.path, start.token, docFile, { contentType: mimeType })
        if (upErr) return void toast.error('Upload failed', { description: upErr.message })

        const done = await finalizeDocumentUpload({ projectId: project.id, name: docName, path: start.path, mimeType, sizeBytes: docFile.size })
        if (!done.success) return void toast.error(done.error)
        addDocToState(done.document)
      }
      toast.success(`Document "${docName.trim()}" added to ${project.name}`)
      refreshStorage()
      setModal(null)
    } finally {
      setBusy(false)
    }
  }

  const openDoc = async (doc: ProjectDocument) => {
    // Open the tab synchronously (avoids popup blockers), then point it at the resolved URL
    const win = window.open('', '_blank')
    const res = await getDocumentOpenUrl(doc.id)
    if (!res.success) { win?.close(); return toast.error(res.error) }
    if (win) { win.opener = null; win.location.href = res.url } else window.location.href = res.url
  }

  const removeDoc = async (doc: ProjectDocument) => {
    if (!confirm(`Delete document "${doc.name}"?`)) return
    const res = await deleteDocument(doc.id)
    if (!res.success) return toast.error(res.error)
    setProjects(prev => prev.map(p => (p.id === doc.project_id ? { ...p, documents: p.documents.filter(d => d.id !== doc.id) } : p)))
    toast.success('Document deleted')
    refreshStorage()
  }

  // ---------- Edit / Delete ----------
  const openEditArea = (area: ProjectArea) => { setAreaName(area.name); setModal({ type: 'editArea', area }) }
  const openEditProject = (project: WorkspaceProject) => {
    setProjName(project.name); setProjClient(project.client_name || ''); setModal({ type: 'editProject', project })
  }
  const openEditDocument = (doc: ProjectDocument) => { setDocName(doc.name); setModal({ type: 'editDocument', doc }) }

  const submitEditArea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'editArea') return
    setBusy(true)
    const res = await renameArea(modal.area.id, areaName)
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setAreas(prev => prev.map(a => (a.id === res.area!.id ? res.area! : a)).sort((a, b) => a.name.localeCompare(b.name)))
    toast.success('Area renamed')
    setModal(null)
  }

  const submitEditProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'editProject') return
    const id = modal.project.id
    setBusy(true)
    const res = await updateWorkspaceProject(id, { name: projName, clientName: projClient })
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, name: projName.trim(), client_name: projClient.trim() } : p))
      .sort((a, b) => a.name.localeCompare(b.name)))
    toast.success('Project updated')
    setModal(null)
  }

  const removeProject = async (project: WorkspaceProject) => {
    const docs = project.documents.length
    if (!confirm(`Delete project "${project.name}"?\n\nThis permanently deletes its ${docs} document${docs === 1 ? '' : 's'} (including uploaded files) and disconnects its Meta integration, if any.\nLeads are kept.`)) return
    const res = await deleteWorkspaceProject(project.id)
    if (!res.success) return toast.error(res.error)
    setProjects(prev => prev.filter(p => p.id !== project.id))
    toast.success('Project deleted')
    refreshStorage()
  }

  const submitEditDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (modal?.type !== 'editDocument') return
    const doc = modal.doc
    setBusy(true)
    const res = await renameDocument(doc.id, docName)
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setProjects(prev => prev.map(p => (p.id === doc.project_id
      ? { ...p, documents: p.documents.map(d => (d.id === doc.id ? { ...d, name: docName.trim() } : d)) }
      : p)))
    toast.success('Document renamed')
    setModal(null)
  }

  const iconBtn = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg cursor-pointer transition-colors'

  const pill = (active: boolean) =>
    `inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${active ? 'bg-[#0f1d33] text-white' : 'bg-white border border-[#e8ecf2] text-[#5a6a82] hover:text-[#0f1d33]'}`

  return (
    <div className="w-full overflow-x-hidden px-4 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl md:text-2xl font-bold text-[#0f1d33]">
            <FolderKanban className="h-6 w-6 text-brand shrink-0" /> Projects
          </h1>
          <p className="mt-0.5 text-xs md:text-sm text-[#5a6a82]">Organise projects by area and keep every document, image, video and link in one place.</p>
        </div>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button onClick={openArea} className={secondaryBtn}><MapPin className="h-4 w-4 text-brand" /> Create Area</button>
            <button onClick={openProject} className={primaryBtn}><Plus className="h-4 w-4" /> Create Project</button>
          </div>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not load projects: {loadError}. If this is a fresh setup, run <code className="font-mono">A_Requirements/supabase_schema.sql</code> in Supabase.</span>
        </div>
      )}

      {/* Search + live storage */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="flex-1 rounded-xl border border-[#e8ecf2] bg-white p-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a99ad]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects or documents" className={`${inputCls} pl-9`} />
          </div>
        </div>
        <StorageIndicator refreshKey={storageKey} />
      </div>

      {/* Areas: filter the projects, and rename or delete an area */}
      {(areas.length > 0 || hasUnassigned) && (
        <div className="mb-4 rounded-xl border border-[#e8ecf2] bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-[#5a6a82]">Areas</p>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]" role="group" aria-label="Filter by area">
            <button type="button" onClick={() => setAreaFilter('all')} className={pill(areaFilter === 'all')}>All</button>
            {areas.map(a => (
              <button key={a.id} type="button" onClick={() => setAreaFilter(areaFilter === a.id ? 'all' : a.id)} className={pill(areaFilter === a.id)}>
                <MapPin className="h-3.5 w-3.5" /> {a.name}
              </button>
            ))}
            {hasUnassigned && <button type="button" onClick={() => setAreaFilter(areaFilter === UNASSIGNED ? 'all' : UNASSIGNED)} className={pill(areaFilter === UNASSIGNED)}>Unassigned</button>}
          </div>
          {canEdit && selectedArea && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e8ecf2] pt-3">
              <span className="mr-1 min-w-0 truncate text-xs font-semibold text-[#0f1d33]">{selectedArea.name}</span>
              <button type="button" onClick={() => openEditArea(selectedArea)} className={`${secondaryBtn} min-h-[40px]`}>
                <Pencil className="h-4 w-4 text-[#5a6a82]" /> Rename
              </button>
              <button type="button" onClick={() => removeArea(selectedArea)}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 cursor-pointer transition-colors hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
          {canEdit && areas.length > 0 && areaFilter === 'all' && <p className="mt-2 text-[11px] text-[#8a99ad]">Tap an area to rename or delete it.</p>}
        </div>
      )}

      {/* Project cards */}
      {visibleProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e8ecf2] bg-white py-16 text-center">
          <FolderKanban className="h-8 w-8 text-[#8a99ad]" />
          <p className="text-sm font-semibold text-[#0f1d33]">No projects here yet</p>
          <p className="text-xs text-[#8a99ad]">{canEdit ? 'Create an area, then create a project inside it.' : 'Projects you can access will appear here.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 md:gap-4">
          {visibleProjects.map(project => (
            <div key={project.id} className="flex min-w-0 flex-col rounded-xl border border-[#e8ecf2] bg-white p-3 sm:p-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-[#0f1d33]" title={project.name}>{project.name}</h3>
                  {project.client_name && <p className="truncate text-xs text-[#5a6a82]">{project.client_name}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-[#f3f5f8] px-2 py-0.5 text-[11px] font-semibold text-[#5a6a82]">
                    {project.documents.length} doc{project.documents.length === 1 ? '' : 's'}
                  </span>
                  {canEdit && (
                    <>
                      <button onClick={() => openEditProject(project)} className={`${iconBtn} hover:bg-[#f3f5f8]`} aria-label={`Edit ${project.name}`} title="Edit project">
                        <Pencil className="h-4 w-4 text-[#5a6a82]" />
                      </button>
                      <button onClick={() => removeProject(project)} className={`${iconBtn} hover:bg-red-50`} aria-label={`Delete ${project.name}`} title="Delete project">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#5a6a82]">
                <MapPin className="h-3.5 w-3.5 text-brand shrink-0" />
                {canEdit ? (
                  <select
                    value={project.area_id && areas.some(a => a.id === project.area_id) ? project.area_id : ''}
                    onChange={(e) => changeProjectArea(project, e.target.value)}
                    className="min-h-[36px] max-w-full truncate rounded-md border border-[#e8ecf2] bg-[#f8fafc] px-2 text-xs font-semibold text-[#0f1d33] cursor-pointer"
                    aria-label={`Area for ${project.name}`}
                  >
                    <option value="">Unassigned</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <span className="font-semibold">{areaName_(project.area_id) || 'Unassigned'}</span>
                )}
              </div>

              <ul className="mt-3 flex flex-col divide-y divide-[#f1f4f8] rounded-lg border border-[#f1f4f8]">
                {project.documents.length === 0 && <li className="px-3 py-3 text-xs text-[#8a99ad]">No documents yet.</li>}
                {project.documents.map(doc => (
                  <li key={doc.id} className="flex items-center gap-2 px-2 py-1">
                    <button onClick={() => openDoc(doc)} className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded px-1 text-left hover:bg-[#f8fafc] cursor-pointer" title={`Open ${doc.name}`}>
                      <DocIcon doc={doc} />
                      <span className="truncate text-xs font-semibold text-[#0f1d33]">{doc.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-[#8a99ad]">{doc.doc_type === 'link' ? 'Link' : formatBytes(doc.size_bytes)}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#8a99ad]" />
                    </button>
                    {canEdit && (
                      <button onClick={() => openEditDocument(doc)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[#f3f5f8] cursor-pointer" aria-label={`Rename ${doc.name}`} title="Rename document">
                        <Pencil className="h-4 w-4 text-[#5a6a82]" />
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => removeDoc(doc)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-red-50 cursor-pointer" aria-label={`Delete ${doc.name}`}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className={`mt-3 grid gap-2 ${canEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <Link href={`/crm/projects/${project.id}`} className={primaryBtn}>
                  <Eye className="h-4 w-4" /> View data
                </Link>
                {canEdit && (
                  <button onClick={() => openDocument(project)} className={secondaryBtn}>
                    <FilePlus2 className="h-4 w-4 text-[#1e3a5f]" /> Create Document
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'area' && (
        <Modal title="Create Area" onClose={closeModal}>
          <form onSubmit={submitArea} className="flex flex-col gap-3">
            <label className="text-xs font-semibold text-[#5a6a82]">Area name
              <input autoFocus required maxLength={100} value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="e.g. Shamshabad" className={`${inputCls} mt-1`} />
            </label>
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Area</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'editArea' && (
        <Modal title="Rename Area" onClose={closeModal}>
          <form onSubmit={submitEditArea} className="flex flex-col gap-3">
            <label className="text-xs font-semibold text-[#5a6a82]">Area name
              <input autoFocus required maxLength={100} value={areaName} onChange={(e) => setAreaName(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'editProject' && (
        <Modal title="Edit Project" onClose={closeModal}>
          <form onSubmit={submitEditProject} className="flex flex-col gap-3">
            <label className="text-xs font-semibold text-[#5a6a82]">Project name
              <input autoFocus required maxLength={150} value={projName} onChange={(e) => setProjName(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-[#5a6a82]">Client name (optional)
              <input maxLength={150} value={projClient} onChange={(e) => setProjClient(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <p className="text-[11px] text-[#8a99ad]">To change the area, use the area dropdown on the project card.</p>
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'editDocument' && (
        <Modal title="Rename Document" onClose={closeModal}>
          <form onSubmit={submitEditDocument} className="flex flex-col gap-3">
            <DocNameInput autoFocus value={docName} onChange={setDocName} />
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'project' && (
        <Modal title="Create Project" onClose={closeModal}>
          <form onSubmit={submitProject} className="flex flex-col gap-3">
            <label className="text-xs font-semibold text-[#5a6a82]">Project name
              <input autoFocus required maxLength={150} value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="e.g. Green Valley Plots" className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-[#5a6a82]">Client name (optional)
              <input maxLength={150} value={projClient} onChange={(e) => setProjClient(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-[#5a6a82]">Area
              <select value={projArea} onChange={(e) => setProjArea(e.target.value)} className={`${inputCls} mt-1 cursor-pointer`}>
                <option value="">Unassigned</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={busy} className={primaryBtn}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create Project</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'document' && (
        <Modal title={`Create Document · ${modal.project.name}`} onClose={closeModal}>
          <form onSubmit={submitDocument} className="flex flex-col gap-3">
            <DocNameInput autoFocus value={docName} onChange={setDocName} placeholder="e.g. Brochure, Layout plan, Site video" />

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f3f5f8] p-1" role="tablist">
              {(['file', 'link'] as const).map(m => (
                <button key={m} type="button" role="tab" aria-selected={docMode === m} onClick={() => setDocMode(m)}
                  className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md text-xs font-semibold cursor-pointer ${docMode === m ? 'bg-white text-[#0f1d33] shadow-xs' : 'text-[#5a6a82]'}`}>
                  {m === 'file' ? <><Upload className="h-4 w-4" /> Upload File</> : <><Link2 className="h-4 w-4" /> Add Link</>}
                </button>
              ))}
            </div>

            {docMode === 'file' ? (
              <label className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#e8ecf2] bg-[#f8fafc] p-4 text-center hover:border-brand">
                <Upload className="h-6 w-6 text-[#8a99ad]" />
                {docFile ? (
                  <span className="max-w-full truncate text-xs font-semibold text-[#0f1d33]">{docFile.name} · {formatBytes(docFile.size)}</span>
                ) : (
                  <span className="text-xs text-[#5a6a82]">Tap to choose an image, video, audio, PDF, Office file or ZIP (max 50 MB)</span>
                )}
                <input type="file" accept={FILE_ACCEPT} className="sr-only" onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  setDocFile(f)
                  if (f && !docName.trim()) setDocName(f.name.replace(/\.[^.]+$/, '').slice(0, DOCUMENT_NAME_MAX_CHARS))
                }} />
              </label>
            ) : (
              <label className="text-xs font-semibold text-[#5a6a82]">Link (http/https)
                <input type="url" required value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://..." className={`${inputCls} mt-1`} />
              </label>
            )}

            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? (docMode === 'file' ? 'Uploading…' : 'Saving…') : 'Save Document'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
