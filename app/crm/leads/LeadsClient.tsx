'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus, Edit2, Trash2, X, Search, Globe, FilterX, Download, Upload, MessageCircle, Megaphone, Settings, ArrowUp, ArrowDown, ArrowUpDown, Check, RefreshCw, AlertTriangle, Loader2, FolderKanban, FileCheck2, FileX2, ChevronDown, Phone, Calendar, SlidersHorizontal } from 'lucide-react'


import { createClient } from '@/lib/supabase/client'
import { canonicalPhoneNumber } from '@/lib/phone-input'
import { createLead, updateLead, deleteLead, deleteMultipleLeads, updateLeadStatus, getLeadActivities, getMetaForms, addMetaForm, deleteMetaForm, updateMetaFormName, getLeads, getProjectsList, toggleMetaFormStatus, reconcileMetaLeadsAction, setLeadFormProject } from './actions'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { toast } from 'sonner'
import { FormImportSwitch } from '@/components/FormImportSwitch'
import ExportLeadsModal from './components/ExportLeadsModal'
import ImportLeadsModal from './components/ImportLeadsModal'
import FollowUpButton from '@/components/FollowUpButton'
import FollowUpDialog from '@/components/FollowUpDialog'
import { isAutoCapturedLead, matchSourceOption, sourceLabel } from '@/lib/lead-source'
import { isFollowUpActivity } from '@/lib/lead-status'
import { ENQUIRY_TYPES, KEEP_CURRENT, matchProjectOption } from '@/lib/lead-fields'
import { getEnquiryTypeOptions } from '../modules/enquiry-type-actions'
import { EnquiryBadge, EnquiryHistoryDialog } from '@/components/EnquiryHistory'
import LeadProjectChips from '@/components/LeadProjectChips'
import { FormProjectSelect } from '@/components/FormProjectSelect'
import { whatsappBubble } from '@/lib/whatsapp-activity'
import { 
  getIstCurrentDateString, 
  getIstYesterdayDateString, 
  getIstDaysAgoDateString 
} from '@/lib/timezone'



const FacebookIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
)

const InstagramIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
)

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.42 9.42 0 1 1 7.99 4.42m8.02-17.44A11.33 11.33 0 0 0 12.04.75C5.8.75.72 5.83.72 12.07c0 2 .52 3.94 1.51 5.65L.62 23.62l6.04-1.58a11.3 11.3 0 0 0 5.38 1.37h.01c6.24 0 11.32-5.08 11.32-11.32 0-3.03-1.18-5.87-3.31-8.01" />
  </svg>
)

/** The WhatsApp chat history button: leads whose source is WhatsApp, and any other lead who has chatted with the bot. */
const isWhatsAppSource = (lead: any) => String(lead?.source_page || '').toLowerCase().includes('whatsapp') || lead?.has_whatsapp === true

const isMetaLead = (lead: any): boolean => {
  if (!lead) return false;
  const src = (lead.source_page || '').toLowerCase();
  return Boolean(
    lead.form_id ||
    src.includes('meta') ||
    src.includes('facebook') ||
    src.includes('instagram')
  );
}

/** `label`: display name of a configured source key (e.g. youtube → "Youtube"). */
const SourceBadge = ({ source, label }: { source: string; label?: string }) => {
  if (!source) return <span className="inline-flex items-center rounded-full bg-[#f3f5f8] px-2.5 py-0.5 text-[10px] font-medium text-[#1e3a5f]">contact</span>;
  
  if (source.startsWith('Meta:')) {
    const parts = source.split(' | ');
    return (
      <div className="flex flex-col gap-1 items-start">
        {parts.map((part, index) => {
          if (part.startsWith('Meta:')) {
            const raw = part.replace('Meta:', '').trim();
            const match = raw.match(/^(.*?)\s+\((.*?)\)$/);
            
            if (match) {
              const name = match[1];
              const id = match[2];
              return (
                <div key={index} className="flex flex-col gap-1 items-start">
                  <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200 max-w-[180px] sm:max-w-xs truncate" title={name}>
                    <FacebookIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                    <span className="truncate">Form: {name}</span>
                  </span>
                  <span className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 border border-slate-200 max-w-[180px] sm:max-w-xs truncate" title={id}>
                    <span className="truncate">ID: {id}</span>
                  </span>
                </div>
              );
            }

            return (
              <span key={index} className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200 max-w-[180px] sm:max-w-xs truncate" title={part}>
                <FacebookIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate">Form: {raw}</span>
              </span>
            );
          }
          if (part.startsWith('Campaign:')) {
            return (
              <span key={index} className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 border border-indigo-200 max-w-[180px] sm:max-w-xs truncate" title={part}>
                <Megaphone className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate">{part.replace('Campaign:', 'Cmp:').trim()}</span>
              </span>
            );
          }
          if (part.startsWith('Ad:')) {
            return (
              <span key={index} className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200 max-w-[180px] sm:max-w-xs truncate" title={part}>
                <span className="truncate">{part.trim()}</span>
              </span>
            );
          }
          return (
            <span key={index} className="inline-flex items-center rounded bg-[#f3f5f8] px-1.5 py-0.5 text-[10px] font-medium text-[#1e3a5f] max-w-[180px] sm:max-w-xs truncate">
              {part.trim()}
            </span>
          );
        })}
      </div>
    );
  }
  
  return (
    <span className="inline-flex items-center rounded-full bg-[#f3f5f8] px-2.5 py-0.5 text-[10px] font-medium text-[#1e3a5f]">
      {label || source}
    </span>
  );
};

export default function LeadsClient({ 
  initialLeads, 
  totalCount = 0, 
  userRole = 'Admin',
  initialStatuses = [],
  initialSources = [],
  canEdit = false
}: { 
  initialLeads: any[]
  totalCount?: number
  userRole?: string
  /** 'edit' access on Leads. View-only users get a read-only screen. */
  canEdit?: boolean
  initialStatuses?: any[]
  initialSources?: any[]
}) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [statuses, setStatuses] = useState<any[]>(initialStatuses)
  const [sources, setSources] = useState<any[]>(
    initialSources && initialSources.length > 0 
      ? initialSources 
      : [
          { id: 'meta', name: 'Meta', key: 'meta' },
          { id: 'website', name: 'Website', key: 'website' },
          { id: 'whatsapp', name: 'WhatsApp', key: 'whatsapp' }
        ]
  )
  const [currentPage, setCurrentPage] = useState(1)
  const [totalLeadsCount, setTotalLeadsCount] = useState(totalCount || initialLeads.length)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [pageSize, setPageSize] = useState<number>(50)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (initialStatuses && initialStatuses.length > 0) {
      setStatuses(initialStatuses)
    }
  }, [initialStatuses])

  useEffect(() => {
    if (initialSources && initialSources.length > 0) {
      setSources(initialSources)
    }
  }, [initialSources])

  const getStatusBadgeStyle = (statusKey: string) => {
    const normalized = (statusKey || 'new').toLowerCase().trim()
    const found = statuses.find(s => s.key.toLowerCase() === normalized)
    if (found) {
      return `${found.color_bg} ${found.color_text} ${found.color_border || 'border-transparent'}`
    }
    if (normalized === 'new') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (normalized === 'contacted') return 'bg-blue-50 text-blue-700 border-blue-200'
    if (normalized === 'uncontacted') return 'bg-orange-50 text-orange-700 border-orange-200'
    if (normalized === 'qualified') return 'bg-purple-50 text-purple-700 border-purple-200'
    if (normalized === 'site_visit_scheduled') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    if (normalized === 'site_visit_done') return 'bg-cyan-50 text-cyan-700 border-cyan-200'
    if (normalized === 'negotiation') return 'bg-amber-50 text-amber-700 border-amber-200'
    if (normalized === 'booked') return 'bg-teal-50 text-teal-700 border-teal-200'
    if (normalized === 'rejected') return 'bg-red-50 text-red-700 border-red-200'
    if (normalized === 'closed') return 'bg-slate-100 text-slate-700 border-slate-200'
    return 'bg-[#f3f5f8] text-[#1e3a5f]'
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > Math.ceil(totalLeadsCount / pageSize)) return;
    setCurrentPage(newPage);
  };
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  // Phones only: the four filter rows are collapsed behind one "Filters" button (always visible from sm: up)
  const [showFilters, setShowFilters] = useState(false)
  const [dateFilterType, setDateFilterType] = useState<'single' | 'range'>('single')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  // Bumped after an import so the list reloads with the new leads
  const [reloadKey, setReloadKey] = useState(0)
  
  // WhatsApp History State
  const [isWhatsappHistoryOpen, setIsWhatsappHistoryOpen] = useState(false)
  const [whatsappLead, setWhatsappLead] = useState<any | null>(null)
  const [whatsappActivities, setWhatsappActivities] = useState<any[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Delete Confirmation Modals State
  const [leadToDelete, setLeadToDelete] = useState<any | null>(null)
  const [isDeletingLead, setIsDeletingLead] = useState(false)
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  useEffect(() => {
    if (isWhatsappHistoryOpen && whatsappLead && !isLoadingActivities && whatsappActivities.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 80)
    }
  }, [isWhatsappHistoryOpen, whatsappLead, isLoadingActivities, whatsappActivities])
  
  // Bulk Selection State
  // Bulk Selection State
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  
  // Projects & Filter State
  const [availableProjects, setAvailableProjects] = useState<{ id: string, name: string, client_name: string, kind?: string }[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('all')
  // 'workspace' = properties (Projects page): a lead's project. 'meta' = Meta clients (Meta page).
  const workspaceProjects = useMemo(() => availableProjects.filter(p => p.kind === 'workspace'), [availableProjects])
  const metaClients = useMemo(() => availableProjects.filter(p => p.kind !== 'workspace'), [availableProjects])

  // Repeat enquiries (same phone number): history popup + "number already exists" warning in Add Lead
  const [enquiryLead, setEnquiryLead] = useState<any | null>(null)
  const [duplicateLead, setDuplicateLead] = useState<any | null>(null)
  const leadFormRef = useRef<HTMLFormElement>(null)

  // Meta Settings State
  const [isMetaSettingsOpen, setIsMetaSettingsOpen] = useState(false)
  const [metaForms, setMetaForms] = useState<any[]>([])
  const [newFormId, setNewFormId] = useState('')
  const [newFormName, setNewFormName] = useState('')
  const [newFormProjectId, setNewFormProjectId] = useState('')
  const [editingMetaFormId, setEditingMetaFormId] = useState<string | null>(null)
  const [editingMetaFormName, setEditingMetaFormName] = useState('')
  const [isMetaLoading, setIsMetaLoading] = useState(false)
  const getSecondsUntilNextCron = () => {
    const now = new Date()
    const next = new Date(now)
    next.setUTCHours(24, 0, 0, 0)
    return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000))
  }

  const [isReconciling, setIsReconciling] = useState(false)
  const [cronCountdown, setCronCountdown] = useState<number | null>(null)
  
  // Mutex refs to synchronously prevent double clicks
  const isSubmittingLeadRef = useRef(false)
  const isDeletingLeadRef = useRef(false)
  const isBulkDeletingRef = useRef(false)
  const isExportingCsvRef = useRef(false)
  const isReconcilingRef = useRef(false)
  const isMetaLoadingRef = useRef(false)
  
  // Sort State
  // Date column = latest enquiry, so a person who enquired again moves back to the top
  type SortField = 'last_enquiry_at' | 'created_at' | 'name' | 'phone' | 'source_page' | 'status'
  const [sortField, setSortField] = useState<SortField>('last_enquiry_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Cron Countdown Effect (aligned to 00:00 UTC daily cron schedule)
  useEffect(() => {
    setCronCountdown(getSecondsUntilNextCron())
    const timer = setInterval(() => {
      setCronCountdown(getSecondsUntilNextCron())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatCronCountdown = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds.toString().padStart(2, '0')}s`
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  }

  useEffect(() => {
    const supabase = createClient()
    
    // Subscribe to all changes in the leads table
    const channel = supabase.channel('leads_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        setLeads((currentLeads) => {
          // Prevent duplicates if local state was updated optimistically
          if (currentLeads.some(l => l.id === payload.new.id)) return currentLeads
          return [payload.new, ...currentLeads]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setLeads((currentLeads) => currentLeads.map(lead => lead.id === payload.new.id ? payload.new : lead))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        setLeads((currentLeads) => currentLeads.filter(lead => lead.id !== payload.old.id))
        setSelectedLeadIds((currentIds) => currentIds.filter(id => id !== payload.old.id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const toggleSourceFilter = (source: string) => {
    setSelectedSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 text-[#5a6a82] opacity-50" />
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1 text-[#1e3a5f]" />
      : <ArrowDown className="w-3 h-3 ml-1 text-[#1e3a5f]" />
  }

  const openAddModal = () => {
    setEditingLead(null)
    setDuplicateLead(null)
    setError('')
    setIsModalOpen(true)
  }

  const openEditModal = (lead: any) => {
    setEditingLead(lead)
    setDuplicateLead(null)
    setError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setDuplicateLead(null)
    setEditingLead(null)
  }

  const openWhatsappHistory = async (lead: any) => {
    setWhatsappLead(lead)
    setIsWhatsappHistoryOpen(true)
    setIsLoadingActivities(true)
    const { data } = await getLeadActivities(lead.id)
    // Follow-up notes live in the Follow up → History tab, not in the message history
    setWhatsappActivities((data || []).filter((a: any) => !isFollowUpActivity(a.activity_type)))
    setIsLoadingActivities(false)
  }

  // Enquiry types come from Modules → Enquiry Types
  const [enquiryTypes, setEnquiryTypes] = useState<string[]>([...ENQUIRY_TYPES])
  useEffect(() => { getEnquiryTypeOptions().then((t) => { if (t.length) setEnquiryTypes(t) }).catch(() => {}) }, [])

  // Load projects list on mount
  useEffect(() => {
    async function loadProjects() {
      const { data } = await getProjectsList()
      if (data) setAvailableProjects(data)
    }
    loadProjects()
  }, [])

  const openMetaSettings = async () => {
    setIsMetaSettingsOpen(true)
    setIsMetaLoading(true)
    const [{ data: formsData }, { data: projectsData }] = await Promise.all([
      getMetaForms(),
      getProjectsList()
    ])
    setMetaForms(formsData || [])
    if (projectsData) setAvailableProjects(projectsData)
    setIsMetaLoading(false)
  }

  const handleAddMetaForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isMetaLoadingRef.current) return
    if (!newFormId.trim()) return
    isMetaLoadingRef.current = true
    setIsMetaLoading(true)
    try {
      const selectedProj = availableProjects.find(p => p.id === newFormProjectId)
      const res = await addMetaForm(
        newFormId,
        newFormName,
        newFormProjectId,
        selectedProj?.name || ''
      )
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Form ID added successfully.')
        setNewFormId('')
        setNewFormName('')
        setNewFormProjectId('')
        const { data } = await getMetaForms()
        setMetaForms(data || [])
      }
    } finally {
      isMetaLoadingRef.current = false
      setIsMetaLoading(false)
    }
  }

  const handleToggleMetaFormStatus = async (form: any) => {
    const newStatus = !(form.is_active !== false)
    try {
      const res = await toggleMetaFormStatus(form.id, newStatus)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(newStatus ? 'Form is Active: leads from it will come into the CRM.' : 'Form is Inactive: leads from it will NOT come into the CRM.')
        setMetaForms(metaForms.map(f => f.id === form.id ? { ...f, is_active: newStatus } : f))
      }
    } catch (err: any) {
      toast.error('Failed to update form status')
    }
  }

  const handleDeleteMetaForm = async (id: string) => {
    if (isMetaLoadingRef.current) return
    if (!confirm('Remove this Form ID?')) return
    isMetaLoadingRef.current = true
    setIsMetaLoading(true)
    try {
      const res = await deleteMetaForm(id)
      if (res.error) {
        alert(res.error)
      } else {
        setMetaForms(metaForms.filter(f => f.id !== id))
      }
    } finally {
      isMetaLoadingRef.current = false
      setIsMetaLoading(false)
    }
  }

  const handleUpdateMetaFormName = async (id: string) => {
    if (isMetaLoadingRef.current) return
    if (!editingMetaFormId) return
    isMetaLoadingRef.current = true
    setIsMetaLoading(true)
    try {
      const res = await updateMetaFormName(id, editingMetaFormName)
      if (res.error) {
        alert(res.error)
      } else {
        setMetaForms(metaForms.map(f => f.id === id ? { ...f, name: editingMetaFormName } : f))
        setEditingMetaFormId(null)
      }
    } finally {
      isMetaLoadingRef.current = false
      setIsMetaLoading(false)
    }
  }

  const handleReconcileLeads = async () => {
    if (isReconcilingRef.current) return
    isReconcilingRef.current = true
    setIsReconciling(true)
    try {
      const res = await reconcileMetaLeadsAction()
      if (!res.success) {
        toast.error('Reconciliation failed', { description: res.error })
      } else {
        if ((res.totalRecovered || 0) > 0) {
          toast.success(`Recovered ${res.totalRecovered} missed leads!`, {
            description: `Scanned ${res.totalChecked || 0} leads across Meta forms.`
          })
        } else {
          toast.success('All leads are up to date!', {
            description: `Verified ${res.totalChecked || 0} leads from Meta with zero drops.`
          })
        }
        router.refresh()
      }
    } catch (err: any) {
      toast.error('Failed to run lead reconciliation', { description: err.message || 'Unknown error' })
    } finally {
      isReconcilingRef.current = false
      setIsReconciling(false)
    }
  }

  const closeWhatsappHistory = () => {
    setIsWhatsappHistoryOpen(false)
    setWhatsappLead(null)
    setWhatsappActivities([])
  }

  // Global Escape key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (leadToDelete) setLeadToDelete(null)
        if (isBulkDeleteModalOpen) setIsBulkDeleteModalOpen(false)
        if (isModalOpen) closeModal()
        if (isWhatsappHistoryOpen) closeWhatsappHistory()
        if (isMetaSettingsOpen) setIsMetaSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [leadToDelete, isBulkDeleteModalOpen, isModalOpen, isWhatsappHistoryOpen, isMetaSettingsOpen])

  // Prevent background scrolling when modal overlays are active
  useEffect(() => {
    const anyModalOpen = Boolean(leadToDelete || isBulkDeleteModalOpen || isModalOpen || isWhatsappHistoryOpen || isMetaSettingsOpen)
    if (anyModalOpen) {
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = orig
      }
    }
  }, [leadToDelete, isBulkDeleteModalOpen, isModalOpen, isWhatsappHistoryOpen, isMetaSettingsOpen])

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0) {
      setSelectedLeadIds([])
    } else {
      setSelectedLeadIds(filteredLeads.map((l: any) => l.id))
    }
  }

  const toggleSelect = (id: string) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(leadId => leadId !== id))
    } else {
      setSelectedLeadIds([...selectedLeadIds, id])
    }
  }

  const handleBulkDelete = () => {
    if (selectedLeadIds.length === 0) return
    setIsBulkDeleteModalOpen(true)
  }

  const confirmBulkDelete = async () => {
    if (isBulkDeletingRef.current) return
    if (selectedLeadIds.length === 0) return
    isBulkDeletingRef.current = true
    setIsBulkDeleting(true)
    try {
      const result = await deleteMultipleLeads(selectedLeadIds)
      if (result.error) {
        toast.error(result.error)
      } else {
        const count = selectedLeadIds.length
        setLeads(leads.filter(l => !selectedLeadIds.includes(l.id)))
        setSelectedLeadIds([])
        setIsBulkDeleteModalOpen(false)
        toast.success(`Successfully deleted ${count} leads`)
        router.refresh()
      }
    } catch {
      toast.error('Failed to delete leads.')
    } finally {
      isBulkDeletingRef.current = false
      setIsBulkDeleting(false)
    }
  }

  const exportToCSV = () => {
    if (isExportingCsvRef.current) return
    isExportingCsvRef.current = true
    try {
      const leadsToExport = filteredLeads;
      if (!leadsToExport || leadsToExport.length === 0) {
        alert('No leads to export');
        return;
      }

      const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Project', 'Enquiry Type', 'Property Interest', 'Location', 'Status', 'Message'];
      const csvRows = [headers.join(',')];

      // Prevent CSV Formula Injection (CWE-1236): prefix leading =, +, -, @, \t, \r with '
      const sanitizeCsvField = (raw: string | null | undefined): string => {
        if (!raw) return '""';
        const str = raw.replace(/"/g, '""').replace(/\n/g, ' ');
        const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
        return `"${safe}"`;
      };

      for (const lead of leadsToExport) {
        const formattedDate = `${new Date(lead.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ${new Date(lead.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`;
        const values = [
          sanitizeCsvField(formattedDate),
          sanitizeCsvField(lead.name),
          sanitizeCsvField(lead.email),
          sanitizeCsvField(lead.phone),
          sanitizeCsvField(lead.source_page || 'contact'),
          sanitizeCsvField(lead.project),
          sanitizeCsvField(lead.enquiry_type),
          sanitizeCsvField(lead.property_interest),
          sanitizeCsvField(lead.location),
          sanitizeCsvField(lead.status || 'new'),
          sanitizeCsvField(lead.message)
        ];
        csvRows.push(values.join(','));
      }

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        isExportingCsvRef.current = false
      }, 500)
    }
  };

  const saveLead = async (formData: FormData) => {
    if (isSubmittingLeadRef.current) return
    isSubmittingLeadRef.current = true
    setIsLoading(true)
    setError('')

    try {
      const result = editingLead
        ? await updateLead(editingLead.id, formData)
        : await createLead(formData)

      if (result.duplicate) {
        // Same phone number already a lead: nothing saved. Offer "add as new enquiry" or "open".
        setDuplicateLead(result.duplicate)
      } else if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        const saved = result.data?.[0]
        if (saved) {
          if (editingLead) {
            setLeads(leads.map(l => l.id === editingLead.id ? saved : l))
          } else if (result.appendedTo) {
            // Saved as a new enquiry on the existing lead: it moves to the top
            setLeads([saved, ...leads.filter(l => l.id !== result.appendedTo)])
            toast.success(`Added as a new enquiry on ${saved.name || 'the existing lead'}`)
          } else {
            setLeads([saved, ...leads])
          }
        }
        closeModal()
      }
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      isSubmittingLeadRef.current = false
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setDuplicateLead(null)
    saveLead(new FormData(e.currentTarget))
  }

  // "This number already exists" → save the form as a new enquiry on that lead
  const addAsEnquiryOnDuplicate = () => {
    if (!duplicateLead || !leadFormRef.current) return
    const fd = new FormData(leadFormRef.current)
    fd.set('add_to_lead_id', duplicateLead.id)
    saveLead(fd)
  }

  // "This number already exists" → open that lead instead
  const openDuplicateLead = () => {
    const target = duplicateLead
    setDuplicateLead(null)
    if (target) openEditModal(target)
  }

  const handleDelete = (lead: any) => {
    setLeadToDelete(lead)
  }

  const confirmDeleteLead = async () => {
    if (!leadToDelete) return
    if (isDeletingLeadRef.current) return
    isDeletingLeadRef.current = true
    setIsDeletingLead(true)
    try {
      const result = await deleteLead(leadToDelete.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        setLeads(leads.filter(l => l.id !== leadToDelete.id))
        setSelectedLeadIds(selectedLeadIds.filter(leadId => leadId !== leadToDelete.id))
        toast.success(`Deleted lead "${leadToDelete.name || 'Lead'}"`)
        setLeadToDelete(null)
        router.refresh()
      }
    } catch {
      toast.error('Failed to delete lead.')
    } finally {
      isDeletingLeadRef.current = false
      setIsDeletingLead(false)
    }
  }

  // Follow ups are separate from status: the Follow up button opens this popup
  const [followUpLead, setFollowUpLead] = useState<any | null>(null)

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const targetLead = leads.find(l => l.id === id)
      const canonicalPhone = canonicalPhoneNumber(targetLead?.phone || '')

      // Compare complete identities, including historically formatted phone values.
      setLeads(prevLeads => prevLeads.map(l => {
        if (l.id === id) return { ...l, status: newStatus }
        if (canonicalPhone && canonicalPhoneNumber(l.phone || '') === canonicalPhone) {
          return { ...l, status: newStatus }
        }
        return l
      }))

      const result = await updateLeadStatus(id, newStatus)
      if (result.error) {
        toast.error('Failed to update status', { description: result.error })
        router.refresh()
      } else {
        const statusObj = statuses.find(s => s.key === newStatus)
        const statusDisplayName = statusObj?.name || newStatus

        if (result.syncedCount && result.syncedCount > 1) {
          toast.success(`Updated to "${statusDisplayName}"`, {
            description: `Synced across ${result.syncedCount} inquiries for ${result.name || 'lead'} (${result.phone || ''}).`
          })
        } else {
          toast.success(`Lead status updated to "${statusDisplayName}"`)
        }
        router.refresh()
      }
    } catch (err: any) {
      toast.error('Failed to update status', { description: err?.message || 'Please try again.' })
    }
  }

  // Debounce search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch leads on filter/page change
  useEffect(() => {
    const fetchFilteredLeads = async () => {
      setIsPageLoading(true);
      try {
        let sd = startDate;
        let ed = endDate;
        if (dateFilterType === 'single' && startDate) {
          ed = startDate; // getLeads will set this to 23:59:59
        }
        
        const filters = {
          searchQuery: debouncedSearchQuery,
          project: selectedProject !== 'all' ? selectedProject : undefined,
          sources: selectedSources,
          status: selectedStatus,
          startDate: sd,
          endDate: ed,
          sortField,
          sortOrder
        };
        const res = await getLeads(currentPage, pageSize, filters);
        setLeads(res.data);
        setTotalLeadsCount(res.count);
        setSelectedLeadIds([]);
      } catch (err) {
        console.error('Error fetching filtered leads:', err);
      } finally {
        setIsPageLoading(false);
      }
    };

    fetchFilteredLeads();
  }, [currentPage, pageSize, debouncedSearchQuery, selectedProject, selectedSources, selectedStatus, startDate, endDate, dateFilterType, sortField, sortOrder, reloadKey]);

  // Reset to page 1 when filters or page size change (but not when page changes)
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, debouncedSearchQuery, selectedProject, selectedSources, selectedStatus, startDate, endDate, dateFilterType, sortField, sortOrder]);

  const filteredLeads = leads; // We now use the server-filtered leads directly


  // Badge on the phone "Filters" button: how many filter groups are active (search excluded: it is always visible)
  const activeFilterCount = (selectedProject !== 'all' ? 1 : 0) + (selectedStatus !== 'all' ? 1 : 0) + (selectedSources.length > 0 ? 1 : 0) + ((startDate || endDate) ? 1 : 0)

  return (
    <div className="space-y-6">
      {enquiryLead && (
        <EnquiryHistoryDialog lead={enquiryLead} onClose={() => setEnquiryLead(null)} />
      )}
      {followUpLead && (
        <FollowUpDialog
          lead={followUpLead}
          canEdit={canEdit}
          onClose={() => setFollowUpLead(null)}
          onChange={(state) => setLeads(prev => prev.map(l => (l.id === followUpLead.id ? { ...l, ...state } : l)))}
        />
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0f1d33]">Leads</h1>
          <p className="mt-2 text-sm text-[#5a6a82]">
            Manage and view your leads from all sources.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {selectedLeadIds.length > 0 && userRole === 'Super Admin' && (
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center w-full sm:w-auto justify-center rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected ({selectedLeadIds.length})
            </button>
          )}

          {canEdit && (
          <button
            onClick={openAddModal}
            className="inline-flex items-center w-full sm:w-auto justify-center rounded-lg bg-gradient-to-r from-brand to-[#b3954c] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-90 transition-opacity"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 bg-white p-3.5 sm:p-4 rounded-xl border border-[#e8ecf2] shadow-sm">
        {/* Row 1: Search Bar & Actions */}
        <div className="flex flex-col md:flex-row items-center gap-3 w-full">
          <div className="flex items-center gap-2 w-full md:flex-1">
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="h-4 w-4 text-[#5a6a82]" />
            </div>
            <input
              type="text"
              placeholder="Search leads…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full min-h-[44px] sm:min-h-0 rounded-lg border border-[#e8ecf2] bg-[#f9fafb] py-2 pl-10 pr-4 text-sm text-[#0f1d33] placeholder-[#5a6a82] outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f] transition-shadow"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            aria-controls="leads-filter-panel"
            className="sm:hidden relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3.5 text-xs font-semibold text-[#1e3a5f] active:bg-[#e8ecf2]"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1e3a5f] px-1 text-[10px] font-bold text-white">{activeFilterCount}</span>
            )}
          </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
            {(selectedProject !== 'all' || selectedStatus !== 'all' || selectedSources.length > 0 || startDate || endDate || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedProject('all')
                  setSelectedStatus('all')
                  setSelectedSources([])
                  setStartDate('')
                  setEndDate('')
                  setSearchQuery('')
                }}
                className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] sm:min-h-0 items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                title="Reset all active filters"
              >
                <FilterX className="w-3.5 h-3.5" /> Clear All Filters
              </button>
            )}

            {userRole === 'Super Admin' && (
              <>
                <button
                  type="button"
                  onClick={handleReconcileLeads}
                  disabled={isReconciling}
                  className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 justify-center rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 sm:px-3.5 sm:py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
                  title="Scan Meta forms across all projects to verify and recover any dropped leads"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-emerald-700 ${isReconciling ? 'animate-spin' : ''}`} />
                  <span>{isReconciling ? 'Reconciling...' : 'Reconcile Leads'}</span>
                  <span suppressHydrationWarning className="text-[10px] font-medium text-emerald-600/90 ml-1 pl-1.5 border-l border-emerald-300 whitespace-nowrap">
                    Next Auto: {cronCountdown !== null ? formatCronCountdown(cronCountdown) : '24h'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={openMetaSettings}
                  className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 justify-center rounded-lg bg-[#f3f5f8] border border-[#e8ecf2] px-3 py-2 sm:px-3.5 sm:py-1.5 text-xs font-semibold text-[#1e3a5f] hover:bg-[#e8ecf2] transition-colors cursor-pointer"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Meta Setup
                </button>
              </>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 justify-center rounded-lg border border-[#002935] bg-white px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-[#002935] shadow-xs hover:bg-[#f3f5f8] transition-all cursor-pointer"
                title="Import leads from an Excel file (.xlsx)"
              >
                <Download className="h-3.5 w-3.5" />
                Import
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className={`${((userRole === 'Super Admin' ? 1 : 0) + (canEdit ? 1 : 0) + 1) % 2 === 1 ? 'col-span-2 sm:col-span-1' : ''} inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 justify-center rounded-lg bg-[#002935] px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#003847] transition-all cursor-pointer`}
              title="Export leads as PDF, Excel, or CSV with custom columns"
            >
              <Upload className="h-3.5 w-3.5 text-brand" />
              Export
            </button>
          </div>
        </div>

        {/* Filter rows: collapsed behind the "Filters" button on phones, always shown from sm: up */}
        <div id="leads-filter-panel" className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-col gap-3.5 min-w-0`}>
        {/* Row 2: Filter by Project (First Filter) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 border-t border-[#f0f3f7] min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a82] shrink-0 whitespace-nowrap select-none flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5 text-brand" />
            Filter by Project:
          </span>

          <div className="flex items-center gap-2 min-w-0 w-full flex-1">
            <button
              onClick={() => setSelectedProject('all')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border shrink-0 select-none ${
                selectedProject === 'all'
                  ? 'bg-[#0f1d33] text-white border-[#0f1d33] shadow-xs font-semibold'
                  : 'bg-[#f3f5f8] text-[#5a6a82] border-transparent hover:bg-[#e8ecf2] hover:text-[#0f1d33]'
              }`}
            >
              All Projects
            </button>

            <div className="w-px h-5 bg-[#e8ecf2] shrink-0" />

            {/* Dynamic Projects Pills */}
            <div 
              className="overflow-x-auto pb-1.5 pt-0.5 flex-1 min-w-0"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#94a3b8 #f1f5f9'
              }}
            >
              <div className="flex items-center gap-2 min-w-max py-0.5">
                {workspaceProjects.length === 0 ? (
                  <span className="text-xs text-[#94a3b8] italic">No projects created yet</span>
                ) : (
                  workspaceProjects.map((p) => {
                    const isSelected = selectedProject.toLowerCase() === p.name.toLowerCase();
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProject(isSelected ? 'all' : p.name)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border shrink-0 ${
                          isSelected
                            ? 'bg-amber-50 text-amber-900 border-amber-300 ring-2 ring-amber-300/30 font-semibold shadow-xs'
                            : 'bg-[#f3f5f8] text-[#5a6a82] border-transparent hover:bg-[#e8ecf2] hover:text-[#0f1d33]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-600' : 'bg-gray-400'}`} />
                        {p.name}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Filter by Source (Dedicated Row with Dynamic Scrollable Pills) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 border-t border-[#f0f3f7] min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a82] shrink-0 whitespace-nowrap select-none">
            Filter by Source:
          </span>

          <div 
            className="overflow-x-auto pb-1.5 pt-0.5 flex-1 min-w-0"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#94a3b8 #f1f5f9'
            }}
          >
            <div className="flex items-center gap-1.5 min-w-max py-0.5">
              {sources.map((src: any) => {
                const sKey = (src.key || src.name || '').toLowerCase().trim();
                const isSelected = selectedSources.includes(sKey);
                return (
                  <button
                    key={src.id || src.key}
                    type="button"
                    onClick={() => toggleSourceFilter(sKey)}
                    className={`inline-flex items-center px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border shrink-0 select-none ${
                      isSelected
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-xs font-semibold'
                        : 'bg-[#f3f5f8] text-[#5a6a82] border-transparent hover:bg-[#e8ecf2] hover:text-[#0f1d33]'
                    }`}
                  >
                    {src.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 4: Date Filter Presets & Inputs (Dedicated New Row) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 border-t border-[#f0f3f7] min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a82] shrink-0 whitespace-nowrap select-none flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#5a6a82]" />
            Date:
          </span>

          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
            {/* Quick Date Presets */}
            <div className="grid grid-cols-4 sm:flex items-center gap-1 bg-[#f3f5f8] rounded-lg p-0.5 border border-[#e8ecf2] w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDateFilterType('single');
                  setStartDate(getIstCurrentDateString());
                  setEndDate('');
                }}
                className={`min-h-[40px] sm:min-h-0 px-1 sm:px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  dateFilterType === 'single' && startDate === getIstCurrentDateString()
                    ? 'bg-[#1877f2] text-white shadow-xs'
                    : 'text-[#5a6a82] hover:text-[#0f1d33]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFilterType('single');
                  setStartDate(getIstYesterdayDateString());
                  setEndDate('');
                }}
                className={`min-h-[40px] sm:min-h-0 px-1 sm:px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  dateFilterType === 'single' && startDate === getIstYesterdayDateString()
                    ? 'bg-[#1877f2] text-white shadow-xs'
                    : 'text-[#5a6a82] hover:text-[#0f1d33]'
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFilterType('range');
                  setStartDate(getIstDaysAgoDateString(7));
                  setEndDate(getIstCurrentDateString());
                }}
                className={`min-h-[40px] sm:min-h-0 px-1 sm:px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  dateFilterType === 'range' && startDate === getIstDaysAgoDateString(7) && endDate === getIstCurrentDateString()
                    ? 'bg-[#1877f2] text-white shadow-xs'
                    : 'text-[#5a6a82] hover:text-[#0f1d33]'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFilterType('range');
                  setStartDate(getIstDaysAgoDateString(30));
                  setEndDate(getIstCurrentDateString());
                }}
                className={`min-h-[40px] sm:min-h-0 px-1 sm:px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  dateFilterType === 'range' && startDate === getIstDaysAgoDateString(30) && endDate === getIstCurrentDateString()
                    ? 'bg-[#1877f2] text-white shadow-xs'
                    : 'text-[#5a6a82] hover:text-[#0f1d33]'
                }`}
              >
                30 Days
              </button>
            </div>

            {/* Single / Range Mode Toggle */}
            <div className="grid grid-cols-2 sm:flex bg-[#f3f5f8] rounded-lg p-0.5 border border-[#e8ecf2] w-full sm:w-auto shrink-0">
              <button
                onClick={() => {
                  setDateFilterType('single')
                  setEndDate('')
                }}
                className={`min-h-[40px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  dateFilterType === 'single'
                    ? 'bg-[#0f1d33] text-white shadow-xs'
                    : 'text-[#5a6a82] hover:text-[#0f1d33]'
                }`}
              >
                Single Date
              </button>
              <button
                onClick={() => setDateFilterType('range')}
                className={`min-h-[40px] sm:min-h-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  dateFilterType === 'range'
                    ? 'bg-[#0f1d33] text-white shadow-xs'
                    : 'text-[#5a6a82] hover:text-[#0f1d33]'
                }`}
              >
                Date Range
              </button>
            </div>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] min-h-[44px] sm:min-h-0 px-2.5 py-1 text-xs text-[#0f1d33] outline-none focus:border-[#1e3a5f] min-w-0 w-full sm:w-auto flex-1 sm:flex-initial"
            />

            {dateFilterType === 'range' && (
              <>
                <span className="text-[#5a6a82] text-xs shrink-0 hidden sm:inline">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] min-h-[44px] sm:min-h-0 px-2.5 py-1 text-xs text-[#0f1d33] outline-none focus:border-[#1e3a5f] min-w-0 w-full sm:w-auto flex-1 sm:flex-initial"
                />
              </>
            )}

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                }}
                className="min-h-[40px] sm:min-h-0 px-3 sm:px-2 py-1 text-[11px] font-medium text-[#dc2626] hover:bg-red-50 rounded-md border border-red-200 transition-colors shrink-0"
              >
                Clear Date
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Filters Section (Horizontally Scrollable Status Filters) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2.5 border-t border-[#f0f3f7] min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a82] shrink-0 whitespace-nowrap select-none">
            Filter by Status:
          </span>

          <div className="flex items-center gap-2 min-w-0 w-full flex-1">
            {/* All Statuses Button - Fixed outside scroll so it never moves */}
            <button
              onClick={() => setSelectedStatus('all')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border shrink-0 select-none ${
                selectedStatus === 'all'
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-xs font-semibold'
                  : 'bg-[#f3f5f8] text-[#5a6a82] border-transparent hover:bg-[#e8ecf2] hover:text-[#0f1d33]'
              }`}
            >
              All Statuses
            </button>

            <div className="w-px h-5 bg-[#e8ecf2] shrink-0" />

            {/* Dynamic Status Pills from Database (Horizontally Scrollable) */}
            <div 
              className="overflow-x-auto pb-1.5 pt-0.5 flex-1 min-w-0"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#94a3b8 #f1f5f9'
              }}
            >
              <div className="flex items-center gap-2 min-w-max py-0.5">
                {/* Dynamic Status Pills from Database */}
                {statuses.map((st: any) => {
                  const sKey = (st.key || st.id || st.name || '').toString().toLowerCase();
                  const isSelected = selectedStatus.toLowerCase() === sKey;
                  return (
                    <button
                      key={st.id || sKey}
                      onClick={() => setSelectedStatus(isSelected ? 'all' : (st.key || sKey))}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border shrink-0 ${
                        isSelected
                          ? `${st.color_bg || 'bg-blue-50'} ${st.color_text || 'text-blue-700'} ${st.color_border || 'border-blue-300'} ring-2 ring-current/25 font-semibold shadow-xs`
                          : 'bg-[#f3f5f8] text-[#5a6a82] border-transparent hover:bg-[#e8ecf2] hover:text-[#0f1d33]'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-current' : 'bg-gray-400'}`} />
                      {st.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Component Just Above the Table: Number of leads for active filter */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white rounded-xl border border-[#e8ecf2] shadow-2xs text-xs gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {selectedProject !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold border bg-amber-50 text-amber-900 border-amber-300">
              <FolderKanban className="w-3.5 h-3.5 text-amber-600" />
              Project: {selectedProject}
            </span>
          )}

          {selectedStatus !== 'all' && (() => {
            const currentStatusObj = statuses.find((s: any) => s.key.toLowerCase() === selectedStatus.toLowerCase())
            return (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold border ${
                currentStatusObj
                  ? `${currentStatusObj.color_bg || 'bg-blue-50'} ${currentStatusObj.color_text || 'text-blue-700'} ${currentStatusObj.color_border || 'border-blue-200'}`
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Status: {currentStatusObj?.name || selectedStatus}
              </span>
            )
          })()}

          {selectedSources.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-[#f3f5f8] text-[#5a6a82] border border-[#e8ecf2]">
              Source: {selectedSources.map(s => {
                const found = sources.find((src: any) => (src.key || '').toLowerCase() === s.toLowerCase());
                return found ? found.name : s.charAt(0).toUpperCase() + s.slice(1);
              }).join(', ')}
            </span>
          )}

          {(startDate || endDate) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-[#f3f5f8] text-[#5a6a82] border border-[#e8ecf2]">
              Date: {startDate}{endDate && startDate !== endDate ? ` to ${endDate}` : ''}
            </span>
          )}

          {debouncedSearchQuery && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-[#f3f5f8] text-[#5a6a82] border border-[#e8ecf2]">
              Search: &quot;{debouncedSearchQuery}&quot;
            </span>
          )}

          {(selectedProject !== 'all' || selectedStatus !== 'all' || selectedSources.length > 0 || startDate || endDate || debouncedSearchQuery) && (
            <button
              onClick={() => {
                setSelectedProject('all')
                setSelectedStatus('all')
                setSelectedSources([])
                setStartDate('')
                setEndDate('')
                setSearchQuery('')
              }}
              className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline shrink-0 ml-1"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Showing leads counter moved to Right Side! */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[#5a6a82]">Showing</span>
          <span className="inline-flex items-center justify-center font-bold text-[#0f1d33] bg-[#f0f4f9] px-2.5 py-0.5 rounded-md border border-[#d8e2ed] text-xs">
            {isPageLoading ? (
              <span className="inline-block w-4 h-3 bg-gray-200 animate-pulse rounded" />
            ) : (
              totalLeadsCount
            )}
          </span>
          <span className="text-[#5a6a82]">
            {totalLeadsCount === 1 ? 'lead' : 'leads'}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-[#e8ecf2] bg-white shadow-sm flex flex-col overflow-hidden h-[65vh] md:h-[75vh]">
        {/* Desktop Table View: fixed layout that fits the screen (no sideways scrolling).
            Phones, tablets and small laptops get the card view below. */}
        <div className="hidden xl:block overflow-y-auto overflow-x-hidden max-h-[70vh]">
          <table className="w-full table-fixed text-xs text-left relative [&_td]:overflow-hidden">
            <thead className="bg-[#f7f8fa] text-[#5a6a82] sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && filteredLeads.every(l => selectedLeadIds.includes(l.id))}
                    onChange={toggleSelectAll}
                    className="rounded border-[#e8ecf2] text-[#1e3a5f] focus:ring-[#1e3a5f]"
                  />
                </th>
                <th className="px-3 py-2 font-medium w-14 whitespace-nowrap text-[#1e3a5f]">Sr. No</th>
                <th className="w-[104px] px-3 py-2 font-medium cursor-pointer hover:bg-[#e8ecf2] transition-colors whitespace-nowrap" onClick={() => handleSort('last_enquiry_at')} title="Latest enquiry">
                  <div className="flex items-center">Date <SortIcon field="last_enquiry_at" /></div>
                </th>
                <th className="px-3 py-2 font-medium cursor-pointer hover:bg-[#e8ecf2] transition-colors whitespace-nowrap" onClick={() => handleSort('name')}>
                  <div className="flex items-center">Name <SortIcon field="name" /></div>
                </th>
                <th className="w-[18%] px-3 py-2 font-medium cursor-pointer hover:bg-[#e8ecf2] transition-colors whitespace-nowrap" onClick={() => handleSort('phone')}>
                  <div className="flex items-center">Contact <SortIcon field="phone" /></div>
                </th>
                <th className="w-[14%] px-3 py-2 font-medium cursor-pointer hover:bg-[#e8ecf2] transition-colors whitespace-nowrap" onClick={() => handleSort('source_page')}>
                  <div className="flex items-center">Source <SortIcon field="source_page" /></div>
                </th>
                <th className="w-[156px] px-3 py-2 font-medium cursor-pointer hover:bg-[#e8ecf2] transition-colors whitespace-nowrap" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status <SortIcon field="status" /></div>
                </th>
                <th className="w-[156px] px-3 py-2 font-medium whitespace-nowrap">Follow up</th>
                {canEdit && (
                  <th className="w-[104px] px-3 py-2 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8ecf2]">
              {filteredLeads && filteredLeads.length > 0 ? (
                filteredLeads.map((lead: any) => (
                  <tr key={lead.id} className="hover:bg-[#f3f5f8] transition-colors">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded border-[#e8ecf2] text-[#1e3a5f] focus:ring-[#1e3a5f]"
                      />
                    </td>
                    <td className="px-3 py-2 text-[#5a6a82] text-sm whitespace-nowrap">
                      {(currentPage - 1) * pageSize + filteredLeads.indexOf(lead) + 1}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {/* Latest enquiry (same as created for a first-time lead) */}
                      <div className="font-medium text-[#0f1d33]">
                        {new Date(lead.last_enquiry_at || lead.created_at).toLocaleDateString('en-US', {
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-xs text-[#5a6a82] mt-0.5">
                        {new Date(lead.last_enquiry_at || lead.created_at).toLocaleTimeString('en-US', {
                          timeZone: 'Asia/Kolkata',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      {(Number(lead.enquiry_count) || 1) > 1 && (
                        <div className="text-[10px] text-[#8a99ad] mt-0.5">
                          First: {new Date(lead.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-[#0f1d33]">{lead.name}</div>
                        <EnquiryBadge lead={lead} onClick={() => setEnquiryLead(lead)} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-[#0f1d33] whitespace-nowrap">{lead.phone || '-'}</div>
                      <div className="text-xs text-[#5a6a82] break-all max-w-[150px]">{lead.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <SourceBadge source={lead.source_page} label={sourceLabel(lead.source_page, sources)} />
                        <LeadProjectChips lead={lead} autoCaptured={isAutoCapturedLead(lead.source_page, lead.form_id)} />
                        {lead.enquiry_type && (
                          <span className="text-xs text-[#5a6a82]">
                            {lead.enquiry_type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative inline-flex items-center">
                        <select
                          value={lead.status || 'new'}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          disabled={!canEdit}
                          title={canEdit ? undefined : 'View only'}
                          className={`inline-flex max-w-full truncate items-center rounded-full pl-2.5 pr-6 py-1 text-xs font-semibold capitalize appearance-none cursor-pointer disabled:cursor-default disabled:opacity-100 border focus:ring-0 hover:opacity-85 transition-opacity ${getStatusBadgeStyle(lead.status)}`}
                        >
                          {statuses.length > 0 ? (
                            statuses.map(s => (
                              <option key={s.id || s.key} value={s.key} className="bg-white text-[#0f1d33]">
                                {s.name}
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="new" className="bg-white text-[#0f1d33]">New</option>
                              <option value="contacted" className="bg-white text-[#0f1d33]">Contacted</option>
                              <option value="uncontacted" className="bg-white text-[#0f1d33]">Uncontacted</option>
                              <option value="qualified" className="bg-white text-[#0f1d33]">Qualified</option>
                              <option value="rejected" className="bg-white text-[#0f1d33]">Rejected</option>
                              <option value="closed" className="bg-white text-[#0f1d33]">Closed</option>
                            </>
                          )}
                        </select>
                        {canEdit && <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60" />}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <FollowUpButton lead={lead} canEdit={canEdit} onClick={() => setFollowUpLead(lead)} />
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          {isWhatsAppSource(lead) && (
                            <button
                              onClick={() => openWhatsappHistory(lead)}
                              className="text-[#0f1d33] hover:text-black p-1.5 rounded-lg hover:bg-[#f3f5f8]"
                              title="WhatsApp chat history"
                              aria-label="WhatsApp chat history"
                            >
                              <WhatsAppIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(lead)}
                            className="text-[#1e3a5f] hover:text-[#0f1d33]"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {userRole === 'Super Admin' && (
                          <button
                            onClick={() => handleDelete(lead)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="px-6 py-8 text-center text-[#5a6a82]">
                    No leads found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>



        {/* Mobile Card View */}
        <div className="xl:hidden flex flex-col divide-y divide-[#e8ecf2] overflow-y-auto">
          {filteredLeads && filteredLeads.length > 0 ? (
            filteredLeads.map((lead: any) => (
              <div key={`mobile-${lead.id}`} className="p-4 flex flex-col gap-3 hover:bg-[#f7f8fa] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="mt-1 rounded border-[#e8ecf2] text-[#1e3a5f] focus:ring-[#1e3a5f]"
                    />
                    <div>
                      <div className="font-semibold text-[#0f1d33] text-base">{lead.name}</div>
                      <div className="text-sm text-[#5a6a82] mt-0.5">
                        {new Date(lead.last_enquiry_at || lead.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(lead.last_enquiry_at || lead.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <EnquiryBadge lead={lead} size="md" onClick={() => setEnquiryLead(lead)} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm ml-7">
                  <div className="flex flex-col">
                    <span className="text-xs text-[#5a6a82] mb-0.5">Contact</span>
                    {lead.phone ? (
                      <a 
                        href={`tel:${lead.phone}`} 
                        className="text-[#0f1d33] font-semibold hover:underline inline-flex items-center gap-1 active:text-blue-700 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{lead.phone}</span>
                      </a>
                    ) : (
                      <span className="text-[#0f1d33] font-medium">-</span>
                    )}
                    <span className="text-xs text-[#5a6a82] truncate block max-w-full overflow-hidden mt-0.5" title={lead.email}>{lead.email}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-[#5a6a82] mb-0.5">Source</span>
                    <div className="flex flex-wrap gap-1">
                      <SourceBadge source={lead.source_page} label={sourceLabel(lead.source_page, sources)} />
                      <LeadProjectChips lead={lead} autoCaptured={isAutoCapturedLead(lead.source_page, lead.form_id)} />
                      {lead.enquiry_type && <span className="text-[10px] text-[#5a6a82]">{lead.enquiry_type}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 ml-7 mt-2 pt-3 border-t border-[#e8ecf2]">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="relative inline-flex items-center">
                    <select
                      value={lead.status || 'new'}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      disabled={!canEdit}
                      title={canEdit ? undefined : 'View only'}
                      className={`inline-flex items-center rounded-full pl-2.5 pr-6 py-1.5 text-xs font-semibold capitalize appearance-none cursor-pointer disabled:cursor-default disabled:opacity-100 border focus:ring-0 hover:opacity-85 transition-opacity ${getStatusBadgeStyle(lead.status)}`}
                    >
                      {statuses.length > 0 ? (
                        statuses.map(s => (
                          <option key={s.id || s.key} value={s.key} className="bg-white text-[#0f1d33]">
                            {s.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="new" className="bg-white text-[#0f1d33]">New</option>
                          <option value="contacted" className="bg-white text-[#0f1d33]">Contacted</option>
                          <option value="uncontacted" className="bg-white text-[#0f1d33]">Uncontacted</option>
                          <option value="qualified" className="bg-white text-[#0f1d33]">Qualified</option>
                          <option value="rejected" className="bg-white text-[#0f1d33]">Rejected</option>
                          <option value="closed" className="bg-white text-[#0f1d33]">Closed</option>
                        </>
                      )}
                    </select>
                    {canEdit && <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60" />}
                  </div>
                  <FollowUpButton lead={lead} canEdit={canEdit} size="md" onClick={() => setFollowUpLead(lead)} />
                  </div>

                  {canEdit && (
                    <div className="flex items-center space-x-1.5">
                      {isWhatsAppSource(lead) && (
                        <button
                          onClick={() => openWhatsappHistory(lead)}
                          className="text-[#0f1d33] hover:bg-[#f3f5f8] active:bg-[#e8ecf2] p-2.5 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors cursor-pointer"
                          title="WhatsApp chat history"
                          aria-label="WhatsApp chat history"
                        >
                          <WhatsAppIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => openEditModal(lead)} 
                        className="text-[#1e3a5f] hover:text-[#0f1d33] p-2.5 hover:bg-[#f3f5f8] active:bg-[#e8ecf2] rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors cursor-pointer"
                        title="Edit Lead"
                        aria-label="Edit Lead"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {userRole === 'Super Admin' && (
                      <button 
                        onClick={() => handleDelete(lead)} 
                        className="text-red-500 hover:text-red-700 p-2.5 hover:bg-red-50 active:bg-red-100 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors cursor-pointer"
                        title="Delete Lead"
                        aria-label="Delete Lead"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-[#5a6a82]">No leads found.</div>
          )}
        </div>

        {/* Pagination UI */}
        {totalLeadsCount > pageSize && (
          <div className="flex items-center justify-between border-t border-[#e8ecf2] bg-white px-4 py-3 sm:px-6 mt-auto">
            <div className="flex flex-1 items-center justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isPageLoading}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600">
                Page {currentPage} of {Math.ceil(totalLeadsCount / pageSize) || 1}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage * pageSize >= totalLeadsCount || isPageLoading}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, totalLeadsCount)}</span> of{' '}
                  <span className="font-medium">{totalLeadsCount}</span> results
                  {isPageLoading && <span className="ml-2 text-brand">Loading...</span>}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-[#5a6a82]">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-xs font-bold text-[#0f1d33] outline-none focus:border-[#1e3a5f] cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>leads per page</span>
                </div>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isPageLoading}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-black ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5 text-black" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage * pageSize >= totalLeadsCount || isPageLoading}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-black ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5 text-black" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Single Lead Delete Confirmation Modal */}
      {leadToDelete && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setLeadToDelete(null) }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1d33]/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-[#e8ecf2] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#e8ecf2] flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-2.5 text-red-600">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0f1d33] text-sm sm:text-base">Delete Lead</h3>
                  <p className="text-xs text-[#5a6a82]">This action cannot be undone</p>
                </div>
              </div>
              <button
                onClick={() => setLeadToDelete(null)}
                className="text-[#5a6a82] hover:text-[#0f1d33] p-1.5 rounded-md hover:bg-white/80 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="bg-[#f8fafc] border border-[#e8ecf2] rounded-xl p-3.5 space-y-1 text-sm">
                <div className="font-semibold text-[#0f1d33] text-base">{leadToDelete.name || 'Unnamed Lead'}</div>
                {leadToDelete.phone && (
                  <div className="text-xs text-[#5a6a82] flex items-center gap-1.5">
                    <span className="font-medium text-[#1e3a5f]">Phone:</span> {leadToDelete.phone}
                  </div>
                )}
                {leadToDelete.email && (
                  <div className="text-xs text-[#5a6a82] flex items-center gap-1.5">
                    <span className="font-medium text-[#1e3a5f]">Email:</span> {leadToDelete.email}
                  </div>
                )}
                {leadToDelete.project && (
                  <div className="text-xs text-[#5a6a82] flex items-center gap-1.5">
                    <span className="font-medium text-[#1e3a5f]">Project:</span> {leadToDelete.project}
                  </div>
                )}
              </div>

              <p className="text-xs text-[#5a6a82] leading-relaxed">
                Are you sure you want to permanently delete this lead? All associated activity logs and notes will also be removed.
              </p>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#e8ecf2]">
                <button
                  type="button"
                  onClick={() => setLeadToDelete(null)}
                  disabled={isDeletingLead}
                  className="px-4 py-2 text-xs font-semibold text-[#5a6a82] hover:text-[#0f1d33] rounded-lg hover:bg-[#f3f5f8] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteLead}
                  disabled={isDeletingLead}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {isDeletingLead ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Yes, Delete Lead
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsBulkDeleteModalOpen(false) }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1d33]/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-[#e8ecf2] overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#e8ecf2] flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-2.5 text-red-600">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0f1d33] text-sm sm:text-base">Bulk Delete Leads</h3>
                  <p className="text-xs text-[#5a6a82]">Permanent batch deletion</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="text-[#5a6a82] hover:text-[#0f1d33] p-1.5 rounded-md hover:bg-white/80 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                You have selected <strong className="font-bold">{selectedLeadIds.length} leads</strong> for deletion.
              </div>

              <p className="text-xs text-[#5a6a82] leading-relaxed">
                Are you sure you want to delete these {selectedLeadIds.length} leads? This action cannot be reversed.
              </p>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#e8ecf2]">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(false)}
                  disabled={isBulkDeleting}
                  className="px-4 py-2 text-xs font-semibold text-[#5a6a82] hover:text-[#0f1d33] rounded-lg hover:bg-[#f3f5f8] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmBulkDelete}
                  disabled={isBulkDeleting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {isBulkDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete {selectedLeadIds.length} Leads
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1d33]/50 p-3 sm:p-4"
        >
          <div className="w-full max-w-2xl rounded-xl sm:rounded-2xl bg-white p-4 sm:p-6 shadow-xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-[#0f1d33]">
                {editingLead ? 'Edit Lead' : 'Add Lead'}
              </h2>
              <button onClick={closeModal} className="text-[#5a6a82] hover:text-[#0f1d33]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form ref={leadFormRef} onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-[#0f1d33] mb-1">Name *</label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    defaultValue={editingLead?.name}
                    className="w-full rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#0f1d33] mb-1">Email <span className="font-normal text-[#8a99ad]">(optional)</span></label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    defaultValue={editingLead?.email}
                    className="w-full rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-[#0f1d33] mb-1">Phone *</label>
                  <input
                    type="tel"
                    name="phone"
                    id="phone"
                    inputMode="tel"
                    required={!editingLead}
                    placeholder="10-digit mobile number"
                    defaultValue={editingLead?.phone}
                    onChange={() => duplicateLead && setDuplicateLead(null)}
                    className="w-full rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-[#0f1d33] mb-1">Status</label>
                  <div className="relative">
                    <select
                      name="status"
                      id="status"
                      defaultValue={editingLead?.status || 'new'}
                      className="w-full appearance-none rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] pl-3 pr-9 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f] cursor-pointer"
                    >
                      {statuses.length > 0 ? (
                        statuses.map(s => (
                          <option key={s.id || s.key} value={s.key}>
                            {s.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="uncontacted">Uncontacted</option>
                          <option value="qualified">Qualified</option>
                          <option value="rejected">Rejected</option>
                          <option value="closed">Closed</option>
                        </>
                      )}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a6a82]" />
                  </div>
                </div>
                <div>
                  <label htmlFor="source_page" className="block text-sm font-medium text-[#0f1d33] mb-1">Source</label>
                  {editingLead && isAutoCapturedLead(editingLead.source_page, editingLead.form_id) ? (
                    // Captured automatically (Meta): the source is locked
                    <div className="rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 py-2.5">
                      <SourceBadge source={editingLead.source_page} label={sourceLabel(editingLead.source_page, sources)} />
                      <p className="mt-1 text-xs text-[#5a6a82]">Set automatically. It can&apos;t be changed.</p>
                    </div>
                  ) : (() => {
                    const legacy = editingLead?.source_page && !matchSourceOption(editingLead.source_page, sources) ? String(editingLead.source_page) : null
                    return (
                      <>
                        <div className="relative">
                          <select
                            key={editingLead?.id || 'new-lead'}
                            name="source_page"
                            id="source_page"
                            required
                            defaultValue={editingLead ? (matchSourceOption(editingLead.source_page, sources)?.key || legacy || '') : ''}
                            className="w-full min-h-[44px] appearance-none rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] pl-3 pr-9 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f] cursor-pointer"
                          >
                            <option value="" disabled>Select a source</option>
                            {legacy && <option value={legacy}>{legacy} (not in list)</option>}
                            {sources.map(s => (
                              <option key={s.id || s.key} value={s.key}>{s.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a6a82]" />
                        </div>
                        <p className="mt-1 text-xs text-[#8a99ad]">
                          {userRole === 'Super Admin'
                            ? <>Missing one? Add it in <a href="/crm/modules" className="font-semibold text-[#1e3a5f] underline">Modules → Lead Sources</a>.</>
                            : 'Missing one? Ask your Super Admin to add it in Modules.'}
                        </p>
                      </>
                    )
                  })()}
                </div>
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-[#0f1d33] mb-1">Location</label>
                  <input
                    type="text"
                    name="location"
                    id="location"
                    defaultValue={editingLead?.location}
                    className="w-full rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label htmlFor="project_id" className="block text-sm font-medium text-[#0f1d33] mb-1">Project</label>
                  {(() => {
                    // Projects come from the Projects page. An older typed value is kept until changed.
                    const matched = matchProjectOption(editingLead, workspaceProjects)
                    const legacy = editingLead?.project && !matched ? String(editingLead.project) : null
                    return (
                      <div className="relative">
                        <select
                          key={`project-${editingLead?.id || 'new-lead'}`}
                          name="project_id"
                          id="project_id"
                          defaultValue={matched?.id || (legacy ? KEEP_CURRENT : '')}
                          className="w-full min-h-[44px] appearance-none rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] pl-3 pr-9 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f] cursor-pointer"
                        >
                          <option value="">No project</option>
                          {legacy && <option value={KEEP_CURRENT}>{legacy} (not in list)</option>}
                          {workspaceProjects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a6a82]" />
                      </div>
                    )
                  })()}
                  {workspaceProjects.length === 0 && (
                    <p className="mt-1 text-xs text-[#8a99ad]">No projects yet. Add them on the Projects page.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="enquiry_type" className="block text-sm font-medium text-[#0f1d33] mb-1">Enquiry Type</label>
                  {(() => {
                    const current = editingLead?.enquiry_type ? String(editingLead.enquiry_type) : ''
                    const listed = enquiryTypes.find(t => t.toLowerCase() === current.toLowerCase())
                    const legacy = current && !listed ? current : null
                    return (
                      <div className="relative">
                        <select
                          key={`enquiry-${editingLead?.id || 'new-lead'}`}
                          name="enquiry_type"
                          id="enquiry_type"
                          defaultValue={listed || (legacy ? KEEP_CURRENT : '')}
                          className="w-full min-h-[44px] appearance-none rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] pl-3 pr-9 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f] cursor-pointer"
                        >
                          <option value="">Not set</option>
                          {legacy && <option value={KEEP_CURRENT}>{legacy} (not in list)</option>}
                          {enquiryTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a6a82]" />
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-[#0f1d33] mb-1">
                  {editingLead && isAutoCapturedLead(editingLead.source_page, editingLead.form_id) ? 'Message from the lead' : 'Notes'}{' '}
                  <span className="font-normal text-[#8a99ad]">(optional)</span>
                </label>
                <textarea
                  name="message"
                  id="message"
                  rows={3}
                  defaultValue={editingLead?.message}
                  placeholder={editingLead && isAutoCapturedLead(editingLead.source_page, editingLead.form_id) ? '' : 'Your notes about this lead. Only your team sees this.'}
                  className="w-full rounded-lg border border-[#e8ecf2] bg-[#f3f5f8] px-3 py-2.5 text-sm text-[#0f1d33] outline-none focus:border-[#1e3a5f]"
                />
              </div>

              {duplicateLead && (
                // Same phone number already a lead: one lead per person
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-4" role="alert">
                  <p className="text-sm font-semibold text-amber-900">
                    This number already belongs to {duplicateLead.name || 'a lead'}
                    {duplicateLead.project ? ` (${duplicateLead.project})` : ''}.
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Nothing was saved. Add this as a new enquiry on that lead, or open the lead.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={addAsEnquiryOnDuplicate}
                      disabled={isLoading}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer"
                    >
                      Add as new enquiry on {duplicateLead.name || 'this lead'}
                    </button>
                    <button
                      type="button"
                      onClick={openDuplicateLead}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                    >
                      Open {duplicateLead.name || 'lead'}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end space-x-3 border-t border-[#e8ecf2] pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[#5a6a82] hover:bg-[#f3f5f8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-brand to-[#b3954c] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isLoading ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp History Modal */}
      {isWhatsappHistoryOpen && whatsappLead && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) closeWhatsappHistory() }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1d33]/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#e8ecf2]">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-full text-green-600">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#0f1d33]">WhatsApp Activity</h2>
                  <p className="text-sm text-[#5a6a82]">{whatsappLead.name} ({whatsappLead.phone})</p>
                </div>
              </div>
              <button aria-label="Close WhatsApp activity" onClick={closeWhatsappHistory} className="text-[#5a6a82] hover:text-[#0f1d33] p-1.5 rounded-lg hover:bg-[#f3f5f8] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-[#5a6a82] mb-4">Chat history and bot interactions for this lead.</p>
            <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2] flex flex-col relative rounded-lg border border-[#e8ecf2]">
              <div className="relative z-10 flex flex-col gap-3 pb-4">
              {isLoadingActivities ? (
                <div className="text-center py-8 text-[#5a6a82]">Loading history...</div>
              ) : whatsappActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[#5a6a82]">
                  <MessageCircle className="h-10 w-10 text-[#5a6a82]/30 mb-3" />
                  <p>No messages recorded yet.</p>
                </div>
              ) : (
                whatsappActivities.map((activity, idx) => {
                  const time = new Date(activity.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
                  const bubble = whatsappBubble(activity);

                  // Customer on the left (white), the business bot on the right (green), like the WhatsApp Business app
                  if (bubble.side === 'customer' || bubble.side === 'bot') {
                    const mine = bubble.side === 'bot';
                    return (
                      <div key={activity.id || idx} className={`flex flex-col max-w-[85%] mt-1 ${mine ? 'items-end self-end' : 'items-start self-start'}`}>
                        <div className={`px-3 pt-2 pb-1.5 rounded-lg shadow-sm text-sm border text-[#111b21] ${mine ? 'bg-[#d9fdd3] border-[#c3e8bd] rounded-tr-none' : 'bg-white border-[#e8ecf2] rounded-tl-none'}`}>
                          <span className={`block mb-0.5 text-[11px] font-bold leading-tight ${mine ? 'text-[#025c4c]' : 'text-[#1e3a5f]'}`}>
                            {mine ? 'WhatsApp bot' : (whatsappLead.name || 'Customer')}
                          </span>
                          <div className="whitespace-pre-wrap break-words leading-snug">{bubble.text}</div>
                          <div className="mt-1 text-right text-[10px] text-[#667781]">{time}</div>
                        </div>
                      </div>
                    );
                  }

                  if (bubble.side === 'hidden') return null;
                  // Anything else in the lead's history (enquiries, status changes, emails) is a small grey note
                  return (
                    <div key={activity.id || idx} className="flex justify-center my-2">
                      <div className="max-w-[90%] bg-[#f3f5f8] text-[#5a6a82] px-3 py-1.5 rounded-2xl text-[11px] font-medium shadow-sm border border-[#e8ecf2] text-center break-words">
                        {bubble.text} • {time}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meta Settings Modal */}
      {isMetaSettingsOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsMetaSettingsOpen(false) }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1d33]/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#e8ecf2]">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                  <FacebookIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#0f1d33]">Meta Lead Ads Sync</h2>
                  <p className="text-sm text-[#5a6a82]">Manage Form IDs to fetch leads automatically</p>
                </div>
              </div>
              <button onClick={() => setIsMetaSettingsOpen(false)} className="text-[#5a6a82] hover:text-[#0f1d33]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              <form onSubmit={handleAddMetaForm} className="bg-[#f7f8fa] p-4 rounded-lg border border-[#e8ecf2]">
                <h3 className="text-sm font-semibold text-[#0f1d33] mb-3">Add New Form ID</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#0f1d33] mb-1">
                      Form ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 10129381239"
                      value={newFormId}
                      onChange={(e) => setNewFormId(e.target.value)}
                      className="w-full rounded-lg border border-[#e8ecf2] bg-white px-3 py-2 text-xs text-[#0f1d33] outline-none focus:border-[#0f1d33]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0f1d33] mb-1">
                      Form Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Brochure Download Form"
                      value={newFormName}
                      onChange={(e) => setNewFormName(e.target.value)}
                      className="w-full rounded-lg border border-[#e8ecf2] bg-white px-3 py-2 text-xs text-[#0f1d33] outline-none focus:border-[#0f1d33]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0f1d33] mb-1">
                      Meta client
                    </label>
                    <div className="relative">
                      <select
                        value={newFormProjectId}
                        onChange={(e) => setNewFormProjectId(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-[#e8ecf2] bg-white pl-3 pr-8 py-2 text-xs text-[#0f1d33] outline-none focus:border-[#0f1d33] cursor-pointer"
                      >
                        <option value="">Select Meta client (Optional)</option>
                        {metaClients.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.client_name})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a6a82]" />
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={isMetaLoading}
                      className="w-full inline-flex items-center justify-center rounded-lg bg-[#0f1d33] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a2d4c] disabled:opacity-50 disabled:pointer-events-none transition-colors"
                    >
                      {isMetaLoading ? 'Adding Form...' : 'Add Form to Project'}
                    </button>
                  </div>
                </div>
              </form>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#0f1d33]">Configured Form IDs</h3>
                  <div className="flex items-center gap-2 text-[11px] text-[#5a6a82]">
                    <span className="text-emerald-700 font-semibold">
                      {metaForms.filter(f => f.is_active !== false).length} Active
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 font-semibold">
                      {metaForms.filter(f => f.is_active === false).length} Inactive
                    </span>
                  </div>
                </div>

                {isMetaLoading && metaForms.length === 0 ? (
                  <div className="text-sm text-[#5a6a82]">Loading forms...</div>
                ) : metaForms.length === 0 ? (
                  <div className="text-sm text-[#5a6a82] bg-[#f3f5f8] p-3 rounded-lg text-center">No forms added yet.</div>
                ) : (
                  <div className="space-y-4">
                    <ul className="space-y-2.5">
                      {metaForms.map((form) => (
                        <li key={form.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white border border-[#e8ecf2] p-3 rounded-lg shadow-2xs hover:border-[#cbd5e1] transition-all">
                          {editingMetaFormId === form.id ? (
                            <div className="flex-1 flex gap-2 mr-3">
                              <input
                                type="text"
                                autoFocus
                                value={editingMetaFormName}
                                onChange={(e) => setEditingMetaFormName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateMetaFormName(form.id)
                                  if (e.key === 'Escape') setEditingMetaFormId(null)
                                }}
                                className="w-full rounded border border-[#e8ecf2] px-2 py-1 text-xs outline-none focus:border-[#0f1d33]"
                              />
                              <button onClick={() => handleUpdateMetaFormName(form.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Save"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingMetaFormId(null)} className="p-1.5 text-[#5a6a82] hover:bg-[#f3f5f8] rounded" title="Cancel"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[#0f1d33]">{form.form_id}</span>
                                {form.project_name && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200" title="Meta client this form belongs to">
                                    <FolderKanban className="h-2.5 w-2.5 text-slate-500" />
                                    Meta: {form.project_name}
                                  </span>
                                )}
                              </div>
                              {form.name && <div className="text-[11px] text-[#5a6a82] mt-0.5 truncate">{form.name}</div>}
                            </div>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-auto">
                            <FormProjectSelect
                              value={form.lead_project_id}
                              projects={workspaceProjects}
                              disabled={!canEdit}
                              onChange={async (projectId) => {
                                const prev = form.lead_project_id
                                setMetaForms(fs => fs.map(f => (f.id === form.id ? { ...f, lead_project_id: projectId } : f)))
                                const res = await setLeadFormProject(form.id, projectId)
                                if (!res.success) {
                                  setMetaForms(fs => fs.map(f => (f.id === form.id ? { ...f, lead_project_id: prev } : f)))
                                  toast.error('Could not link the form', { description: res.error })
                                } else {
                                  toast.success(projectId ? 'Form linked: new leads get this project' : 'Form unlinked from its project')
                                }
                              }}
                            />
                            <FormImportSwitch on={form.is_active !== false} onToggle={() => handleToggleMetaFormStatus(form)} />

                            {editingMetaFormId !== form.id && (
                              <button
                                onClick={() => {
                                  setEditingMetaFormId(form.id)
                                  setEditingMetaFormName(form.name || '')
                                }}
                                className="text-[#5a6a82] hover:text-[#0f1d33] p-1.5 hover:bg-[#f3f5f8] rounded-md transition-colors"
                                title="Edit Name"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {editingMetaFormId !== form.id && (
                              <button
                                onClick={() => handleDeleteMetaForm(form.id)}
                                className="text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-md transition-colors"
                                title="Remove Form"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6 border-t border-[#e8ecf2] pt-4 text-xs text-[#5a6a82]">
              The system will automatically sync leads from these forms every 15 minutes.
            </div>
          </div>
        </div>
      )}
      {isImportModalOpen && (
        <ImportLeadsModal
          onClose={() => setIsImportModalOpen(false)}
          onImported={(count) => {
            toast.success(`${count} lead${count === 1 ? '' : 's'} imported`)
            setReloadKey(k => k + 1)
            router.refresh()
          }}
        />
      )}
      {/* Export Leads Custom Modal (PDF, Excel, CSV with column selection) */}
      <ExportLeadsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        leads={filteredLeads}
        selectedLeadIds={selectedLeadIds}
        activeFiltersSummary={
          [
            selectedStatus !== 'all' ? `Status: ${selectedStatus}` : null,
            selectedSources.length > 0 ? `Source: ${selectedSources.join(', ')}` : null,
            startDate ? `From: ${startDate}` : null,
            endDate ? `To: ${endDate}` : null,
            debouncedSearchQuery ? `Search: "${debouncedSearchQuery}"` : null
          ].filter(Boolean).join(' • ')
        }
      />
    </div>
  )
}
