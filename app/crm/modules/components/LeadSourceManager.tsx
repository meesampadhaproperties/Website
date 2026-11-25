'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  Globe2, 
  Plus, 
  Edit2, 
  Trash2, 
  Lock, 
  Loader2, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { 
  LeadSource, 
  createLeadSource, 
  updateLeadSource, 
  deleteLeadSource 
} from '../actions'

interface LeadSourceManagerProps {
  initialSources: LeadSource[]
}

export default function LeadSourceManager({ initialSources }: LeadSourceManagerProps) {
  const [sources, setSources] = useState<LeadSource[]>(initialSources)

  // Pagination State (10 per page)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(sources.length / pageSize))
  const paginatedSources = sources.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [sources.length, totalPages, currentPage])

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)

  // Delete Modal State
  const [deletingSource, setDeletingSource] = useState<LeadSource | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const isDeletingRef = useRef(false)
  const [deleteError, setDeleteError] = useState('')

  // Escape key & body scroll lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isModalOpen) setIsModalOpen(false)
        if (deletingSource) setDeletingSource(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, deletingSource])

  useEffect(() => {
    if (isModalOpen || deletingSource) {
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = orig
      }
    }
  }, [isModalOpen, deletingSource])

  // Open Create Modal
  const openCreateModal = () => {
    setEditingSource(null)
    setName('')
    setFormError('')
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const openEditModal = (src: LeadSource) => {
    setEditingSource(src)
    setName(src.name)
    setFormError('')
    setIsModalOpen(true)
  }

  // Submit Form (Create / Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmittingRef.current) return

    setFormError('')
    const trimmed = name.trim()

    if (!trimmed) {
      setFormError('Please enter a source name.')
      return
    }

    isSubmittingRef.current = true
    setIsSubmitting(true)

    try {
      if (editingSource) {
        // Update
        const res = await updateLeadSource(editingSource.id, {
          name: trimmed
        })

        if (!res.success) {
          setFormError(res.error || 'Failed to update source.')
          return
        }

        setSources(prev => prev.map(s => s.id === editingSource.id ? { ...s, ...res.data! } : s))
        toast.success('Lead source updated', {
          description: `"${trimmed}" has been updated in CRM filters.`
        })
      } else {
        // Auto-assign next sort order in background
        const nextOrder = sources.reduce((max, s) => Math.max(max, s.sort_order || 0), 0) + 1
        const res = await createLeadSource({
          name: trimmed,
          sort_order: nextOrder
        })

        if (!res.success) {
          setFormError(res.error || 'Failed to create source.')
          return
        }

        setSources(prev => [...prev, res.data!].sort((a, b) => a.sort_order - b.sort_order))
        toast.success('New lead source created', {
          description: `"${trimmed}" is now available across CRM filters.`
        })
      }

      setIsModalOpen(false)
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred.')
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  // Initiate Delete
  const initiateDelete = (src: LeadSource) => {
    if (src.is_system) {
      toast.error('System Protected Source', {
        description: `"${src.name}" is a core CRM system source and cannot be deleted.`
      })
      return
    }

    setDeletingSource(src)
    setDeleteError('')
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingSource) return
    if (isDeletingRef.current) return

    isDeletingRef.current = true
    setIsDeleting(true)
    setDeleteError('')

    try {
      const res = await deleteLeadSource(deletingSource.id)

      if (!res.success) {
        setDeleteError(res.error || 'Failed to delete source.')
        return
      }

      setSources(prev => prev.filter(s => s.id !== deletingSource.id))
      toast.success(`Deleted "${deletingSource.name}"`, {
        description: 'Source removed from CRM filters.'
      })

      setDeletingSource(null)
    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred during deletion.')
    } finally {
      isDeletingRef.current = false
      setIsDeleting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e8ecf2] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#e8ecf2] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#f3f5f8] rounded-lg text-[#1e3a5f]">
              <Globe2 className="w-5 h-5 text-[#1e3a5f]" />
            </span>
            <h2 className="text-lg font-semibold text-[#0f1d33]">
              Lead Sources & Channels
            </h2>
          </div>
          <p className="text-sm text-[#5a6a82] mt-1">
            Manage dynamic lead capture channels (Meta, Website, WhatsApp, YouTube, LinkedIn, etc.) shown in CRM filters.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#152843] rounded-lg shadow-xs transition-colors self-start sm:self-center min-h-[38px] touch-manipulation cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </button>
      </div>

      {/* Sources Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e8ecf2] text-[11px] font-semibold text-[#5a6a82] uppercase tracking-wider">
              <th className="py-3 px-4">Source Name</th>
              <th className="py-3 px-4">Identifier Key</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8ecf2] text-sm">
            {sources.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-8 text-[#5a6a82]">
                  No sources configured yet. Click &quot;Add Source&quot; above.
                </td>
              </tr>
            ) : (
              paginatedSources.map((src) => (
                <tr key={src.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-[#f3f5f8] text-[#0f1d33] border-[#e8ecf2]">
                      {src.name}
                      {src.is_system && (
                        <span title="System default source (protected)">
                          <Lock className="w-3 h-3 text-[#5a6a82] opacity-70 ml-0.5" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-[#5a6a82]">
                    {src.key}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEditModal(src)}
                        className="p-1.5 text-[#5a6a82] hover:text-[#1e3a5f] hover:bg-[#f3f5f8] rounded-md transition-colors"
                        title="Edit source"
                        aria-label="Edit source"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {src.is_system ? (
                        <span 
                          className="p-1.5 text-[#94a3b8] opacity-50 cursor-not-allowed inline-flex items-center"
                          title="System default source cannot be deleted"
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <button
                          onClick={() => initiateDelete(src)}
                          className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Delete source"
                          aria-label="Delete source"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination (10 per page): always visible so the count and page are clear */}
      {sources.length > 0 && (
        <div className="p-4 border-t border-[#e8ecf2] flex items-center justify-between text-xs text-[#5a6a82] bg-[#f8fafc]">
          <span>
            Page {currentPage} of {totalPages} ({sources.length} sources)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-[#e8ecf2] rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4 text-[#5a6a82]" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-[#e8ecf2] rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4 text-[#5a6a82]" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Source Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-[#0f1d33]/50 backdrop-blur-xs transition-opacity" 
            onClick={() => !isSubmitting && setIsModalOpen(false)} 
          />
          <div className="relative bg-white rounded-2xl border border-[#e8ecf2] shadow-2xl max-w-md w-full p-6 overflow-hidden z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#e8ecf2]">
              <h3 className="text-base font-bold text-[#0f1d33]">
                {editingSource ? 'Edit Lead Source' : 'Create New Lead Source'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="p-1 rounded-md text-[#5a6a82] hover:bg-[#f3f5f8] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#0f1d33] mb-1">
                  Source Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. YouTube, LinkedIn, Google Ads, Referral"
                  className="w-full px-3 py-2 text-sm border border-[#e8ecf2] rounded-lg bg-[#f8fafc] text-[#0f1d33] focus:outline-none focus:border-[#1e3a5f] focus:bg-white transition-all"
                  autoFocus
                />
                <p className="text-[11px] text-[#5a6a82] mt-1">
                  Shown as a clean text pill in CRM leads filter.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8ecf2]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-medium text-[#5a6a82] hover:bg-[#f3f5f8] rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#152843] rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingSource ? 'Save Changes' : 'Create Source'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Source Modal */}
      {deletingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-[#0f1d33]/50 backdrop-blur-xs transition-opacity" 
            onClick={() => !isDeleting && setDeletingSource(null)} 
          />
          <div className="relative bg-white rounded-2xl border border-[#e8ecf2] shadow-2xl max-w-sm w-full p-6 overflow-hidden z-10 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-[#0f1d33]">
              Delete Lead Source
            </h3>
            <p className="text-xs text-[#5a6a82] mt-2 leading-relaxed">
              Are you sure you want to delete source <strong className="text-[#0f1d33]">&quot;{deletingSource.name}&quot;</strong>? It will be removed from future lead filters.
            </p>

            {deleteError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDeletingSource(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-medium text-[#5a6a82] hover:bg-[#f3f5f8] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete Source
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
