'use client'

import { useState, useEffect } from 'react'
import { Shield, User, Save, Loader2, Info, ChevronDown, Search, Check, Lock } from 'lucide-react'
import { getRolePermissions, updateRolePermissions, getUserPermissions, updateUserPermissions, AccessLevel, RolePermission, UserPermission } from '../actions'
import { getRoles, listAdminUsers } from '@/app/crm/users/actions'
import { buildPermissionPayload } from '@/lib/access-payload'

const CRM_MODULES: { id: string; label: string; canEdit?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', canEdit: false },
  { id: 'leads', label: 'Leads', canEdit: true },
  { id: 'meta', label: 'Meta', canEdit: true },
  { id: 'projects', label: 'Projects', canEdit: true },
  { id: 'inbox', label: 'Inbox', canEdit: true },
  { id: 'bulk_sender', label: 'Bulk Sender', canEdit: true },
  { id: 'reports', label: 'Reports', canEdit: false },
  { id: 'modules', label: 'Modules' },
  { id: 'users', label: 'Users' },
  { id: 'settings', label: 'Settings', canEdit: true }
]

export default function AccessControl({ roles: propRoles, users: propUsers }: { roles: any[], users: any[] }) {
  const [rolesList, setRolesList] = useState<any[]>(propRoles || [])
  const [usersList, setUsersList] = useState<any[]>(propUsers || [])
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles')
  const [selectedRoleId, setSelectedRoleId] = useState<string>(propRoles[0]?.id || '')
  const [selectedUserId, setSelectedUserId] = useState<string>(propUsers[0]?.id || '')
  
  // State for the matrix
  const [permissions, setPermissions] = useState<Record<string, AccessLevel>>({})
  const [initialPermissions, setInitialPermissions] = useState<Record<string, AccessLevel>>({})
  const [inheritedPermissions, setInheritedPermissions] = useState<Record<string, AccessLevel>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)
  
  // State for user search dropdown
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')

  // Sync state whenever props change
  useEffect(() => {
    if (propRoles && propRoles.length > 0) {
      setRolesList(propRoles)
      setSelectedRoleId(prev => {
        if (!prev || !propRoles.some(r => r.id === prev)) {
          return propRoles[0].id
        }
        return prev
      })
    }
  }, [propRoles])

  useEffect(() => {
    if (propUsers && propUsers.length > 0) {
      setUsersList(propUsers)
      setSelectedUserId(prev => {
        if (!prev || !propUsers.some(u => u.id === prev)) {
          return propUsers[0].id
        }
        return prev
      })
    }
  }, [propUsers])

  // Live real-time refresh on mount to immediately pick up any newly created roles or users
  useEffect(() => {
    let isMounted = true
    async function refreshLive() {
      try {
        const [rRes, uRes] = await Promise.all([
          getRoles(),
          listAdminUsers()
        ])
        if (!isMounted) return
        if (rRes?.data && rRes.data.length > 0) {
          setRolesList(rRes.data)
          setSelectedRoleId(prev => {
            if (!prev || !rRes.data.some((r: any) => r.id === prev)) {
              return rRes.data[0].id
            }
            return prev
          })
        }
        if (uRes?.users && uRes.users.length > 0) {
          setUsersList(uRes.users)
          setSelectedUserId(prev => {
            if (!prev || !uRes.users.some((u: any) => u.id === prev)) {
              return uRes.users[0].id
            }
            return prev
          })
        }
      } catch (err) {
        console.error('Error refreshing roles/users in AccessControl:', err)
      }
    }
    refreshLive()
    return () => { isMounted = false }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-dropdown-container')) {
        setIsUserDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredUsers = usersList.filter(u => 
    (u.name || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase())
  )
  const selectedUser = usersList.find(u => u.id === selectedUserId)

  // Fetch permissions when selection changes
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setMessage(null)
      try {
        if (activeTab === 'roles' && selectedRoleId) {
          const res = await getRolePermissions(selectedRoleId)
          if (res.error) throw new Error(res.error)
          const permMap: Record<string, AccessLevel> = {}
          res.data.forEach(p => { permMap[p.module_name] = p.access_level })
          if (permMap['whatsapp'] && !permMap['inbox']) {
            permMap['inbox'] = permMap['whatsapp']
          }
          setPermissions(permMap)
          setInitialPermissions(permMap)
        } else if (activeTab === 'users' && selectedUserId) {
          const res = await getUserPermissions(selectedUserId)
          if (res.error) throw new Error(res.error)
          const permMap: Record<string, AccessLevel> = {}
          res.data.forEach(p => { permMap[p.module_name] = p.access_level })
          if (permMap['whatsapp'] && !permMap['inbox']) {
            permMap['inbox'] = permMap['whatsapp']
          }
          setPermissions(permMap)
          setInitialPermissions(permMap)

          const user = usersList.find(u => u.id === selectedUserId)
          if (user && user.role) {
            const roleObj = rolesList.find(r => r.name === user.role)
            if (roleObj) {
              const roleRes = await getRolePermissions(roleObj.id)
              if (!roleRes.error && roleRes.data) {
                const rolePermMap: Record<string, AccessLevel> = {}
                roleRes.data.forEach(p => { rolePermMap[p.module_name] = p.access_level })
                setInheritedPermissions(rolePermMap)
              }
            }
          } else {
            setInheritedPermissions({})
          }
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message })
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [activeTab, selectedRoleId, selectedUserId, rolesList, usersList])

  const handleAccessChange = (module: string, level: AccessLevel) => {
    const targetModule = CRM_MODULES.find(m => m.id === module)
    const safeLevel = (targetModule?.canEdit === false && level === 'edit') ? 'view' : level
    setPermissions(prev => {
      const next = { ...prev }
      if (activeTab === 'users' && safeLevel === inheritedPermissions[module]) {
        // If they select the level that matches the role default, we can remove the override
        delete next[module]
      } else {
        next[module] = safeLevel
      }
      return next
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const payload = buildPermissionPayload(permissions)

      let res;
      if (activeTab === 'roles') {
        res = await updateRolePermissions(selectedRoleId, payload)
      } else {
        res = await updateUserPermissions(selectedUserId, payload)
      }

      if (res.error) throw new Error(res.error)
      setMessage({ type: 'success', text: 'Permissions saved successfully!' })
      setInitialPermissions(permissions)
      // Refresh the sidebar's cached permissions (it no longer refetches on every navigation)
      window.dispatchEvent(new Event('crm-permissions-changed'))
      setTimeout(() => setMessage(null), 3000)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  const isSuperAdmin = 
    (activeTab === 'roles' && rolesList.find(r => r.id === selectedRoleId)?.name === 'Super Admin') ||
    (activeTab === 'users' && usersList.find(u => u.id === selectedUserId)?.role === 'Super Admin')

  const isDirty = JSON.stringify(permissions) !== JSON.stringify(initialPermissions)

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf2] shadow-sm overflow-hidden">
      <div className="border-b border-[#e8ecf2] bg-[#f8fafc] p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-[#0f1d33]">Access Control</h2>
        <p className="text-xs sm:text-sm text-[#5a6a82] mt-1">Manage granular view and edit permissions for roles and specific users.</p>
      </div>

      <div className="p-4 sm:p-6">
        {/* Tabs */}
        <div className="flex w-full sm:w-fit space-x-1 p-1 bg-[#f3f5f8] rounded-xl mb-6 sm:mb-8">
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex-1 sm:flex-initial flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'roles' ? 'bg-white text-[#0f1d33] shadow-sm' : 'text-[#5a6a82] hover:text-[#0f1d33]'
            }`}
          >
            <Shield className="w-4 h-4 mr-2" />
            Role Permissions
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 sm:flex-initial flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'users' ? 'bg-white text-[#0f1d33] shadow-sm' : 'text-[#5a6a82] hover:text-[#0f1d33]'
            }`}
          >
            <User className="w-4 h-4 mr-2" />
            User Overrides
          </button>
        </div>

        {/* Selectors */}
        <div className="mb-6 max-w-lg">
          {activeTab === 'roles' ? (
            <div>
              <label className="block text-sm font-semibold text-[#0f1d33] mb-1.5">Select Role</label>
              <div className="relative">
                <select 
                  value={selectedRoleId} 
                  onChange={e => setSelectedRoleId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[#e8ecf2] bg-white pl-3 pr-10 py-2 text-sm text-[#0f1d33] outline-none focus:ring-2 focus:ring-brand focus:border-transparent cursor-pointer"
                >
                  {rolesList.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#5a6a82]">
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-[#0f1d33] mb-1.5">Select User (Overrides Role)</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="relative flex-1 user-dropdown-container w-full">
                  <div 
                    className="w-full flex items-center justify-between rounded-lg border border-[#e8ecf2] bg-white px-3 py-2 text-sm text-[#0f1d33] cursor-pointer outline-none focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent"
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  >
                    <span className="truncate">
                      {selectedUser ? (
                        <>
                          <span className="font-medium">{selectedUser.name || 'Unknown'}</span>
                          <span className="text-[#5a6a82] ml-2 text-xs sm:text-sm">({selectedUser.email || 'No email'})</span>
                        </>
                      ) : (
                        'Select a user...'
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#5a6a82] shrink-0 ml-2" />
                  </div>
                  
                  {isUserDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-[#e8ecf2] bg-white shadow-lg overflow-hidden flex flex-col max-h-60">
                      <div className="p-2 border-b border-[#e8ecf2] bg-[#f8fafc] sticky top-0 z-10 flex items-center gap-2">
                        <Search className="h-4 w-4 text-[#5a6a82]" />
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm outline-none text-[#0f1d33] placeholder:text-[#8c9bad]"
                          placeholder="Search name or email..."
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="overflow-y-auto">
                        {filteredUsers.length > 0 ? (
                          filteredUsers.map(u => (
                            <div
                              key={u.id}
                              className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between hover:bg-[#f3f5f8] ${selectedUserId === u.id ? 'bg-[#f3f5f8]' : ''}`}
                              onClick={() => {
                                setSelectedUserId(u.id)
                                setIsUserDropdownOpen(false)
                                setUserSearchQuery('')
                              }}
                            >
                              <div className="flex flex-col truncate pr-2">
                                <span className="text-[#0f1d33] font-medium truncate">{u.name || 'Unknown'}</span>
                                <span className="text-xs text-[#5a6a82] truncate">{u.email || 'No email'}</span>
                              </div>
                              {selectedUserId === u.id && <Check className="h-4 w-4 text-brand shrink-0" />}
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-center text-sm text-[#5a6a82]">
                            No users found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {usersList.find(u => u.id === selectedUserId)?.role && (
                  <span className="text-brand font-medium text-xs bg-brand/10 px-3 py-1.5 rounded-lg border border-brand/20 shrink-0 w-fit">
                    Role: {usersList.find(u => u.id === selectedUserId)?.role}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Matrix */}
        <div 
          className="border border-[#e8ecf2] rounded-xl overflow-hidden relative shadow-2xs"
        >
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
          )}
          
          <table className="w-full text-left text-xs sm:text-sm table-fixed">
            <thead className="bg-[#f8fafc] border-b border-[#e8ecf2]">
              <tr>
                <th className="w-[37%] px-3 sm:px-5 py-3 sm:py-3.5 font-semibold text-[#0f1d33] truncate">Module / Page</th>
                <th className="w-[21%] px-1 sm:px-3 py-3 sm:py-3.5 font-semibold text-center text-red-600 ">No<span className="hidden sm:inline"> Access</span></th>
                <th className="w-[21%] px-1 sm:px-3 py-3 sm:py-3.5 font-semibold text-center text-amber-600 ">View<span className="hidden sm:inline"> Only</span></th>
                <th className="w-[21%] px-1 sm:px-3 py-3 sm:py-3.5 font-semibold text-center text-emerald-600 ">Edit<span className="hidden sm:inline"> Access</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8ecf2]">
              {CRM_MODULES.map(mod => {
                // Modules & Users are strictly Super Admin only and cannot be delegated
                if (mod.id === 'modules' || mod.id === 'users') {
                  return (
                    <tr key={mod.id} className="bg-[#fafbfc]/80 hover:bg-[#f8fafc] transition-colors border-b border-[#e8ecf2]">
                      <td className="w-[37%] px-3 sm:px-5 py-2.5 sm:py-3 font-medium text-[#0f1d33]">
                        <span className="font-semibold text-xs sm:text-sm text-[#0f1d33] truncate block">{mod.label}</span>
                      </td>
                      <td colSpan={3} className="px-2 sm:px-4 py-2.5 sm:py-3 text-center">
                        <div className="flex items-center justify-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-50 text-amber-800 border border-amber-200/90 whitespace-nowrap shadow-2xs">
                            <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                            Super Admin Only
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const userOverride = permissions[mod.id]
                const inherited = inheritedPermissions[mod.id]
                
                // Effective level is the user override, or the inherited role permission, or 'none'
                let effectiveLevel = 'none'
                if (activeTab === 'roles') {
                  effectiveLevel = userOverride || 'none'
                } else {
                  effectiveLevel = userOverride || inherited || 'none'
                }
                
                return (
                  <tr key={mod.id} className="hover:bg-[#f8fafc]/50 transition-colors">
                    <td className="w-[37%] px-3 sm:px-5 py-2.5 sm:py-3 font-medium text-[#0f1d33]">
                      <span className="font-medium text-xs sm:text-sm text-[#0f1d33] truncate block">{mod.label}</span>
                    </td>

                    <td className="w-[21%] px-1 sm:px-3 py-2 sm:py-2.5 text-center bg-red-50/30">
                      <label className="flex items-center justify-center p-1.5 cursor-pointer min-h-[38px]">
                        <input 
                          type="radio" 
                          name={`${mod.id}-access`} 
                          checked={effectiveLevel === 'none' && !isSuperAdmin}
                          onChange={() => handleAccessChange(mod.id, 'none')}
                          disabled={isSuperAdmin}
                          className="w-4 h-4 text-red-600 focus:ring-red-600 border-red-300 disabled:opacity-50 cursor-pointer"
                        />
                      </label>
                    </td>
                    
                    <td className="w-[21%] px-1 sm:px-3 py-2 sm:py-2.5 text-center bg-amber-50/30">
                      <label className="flex items-center justify-center p-1.5 cursor-pointer min-h-[38px]">
                        <input 
                          type="radio" 
                          name={`${mod.id}-access`} 
                          checked={(effectiveLevel === 'view' || (mod.canEdit === false && effectiveLevel === 'edit')) && !isSuperAdmin}
                          onChange={() => handleAccessChange(mod.id, 'view')}
                          disabled={isSuperAdmin}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-600 border-amber-300 disabled:opacity-50 cursor-pointer"
                        />
                      </label>
                    </td>
                    
                    <td className="w-[21%] px-1 sm:px-3 py-2 sm:py-2.5 text-center bg-emerald-50/30">
                      {mod.canEdit === false ? (
                        <div 
                          className="flex items-center justify-center min-h-[38px] text-xs font-semibold text-gray-400 select-none"
                          title="View-only module (no editable records)"
                        >
                          <span>&mdash;</span>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center p-1.5 cursor-pointer min-h-[38px]">
                          <input 
                            type="radio" 
                            name={`${mod.id}-access`} 
                            checked={effectiveLevel === 'edit' || isSuperAdmin}
                            onChange={() => handleAccessChange(mod.id, 'edit')}
                            disabled={isSuperAdmin}
                            className="w-4 h-4 text-emerald-600 focus:ring-emerald-600 border-emerald-300 disabled:opacity-50 cursor-pointer"
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {isSuperAdmin && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] flex items-center justify-center p-6 text-center z-20">
              <div className="bg-white border border-[#e8ecf2] shadow-lg rounded-xl p-6 max-w-sm">
                <Shield className="w-10 h-10 text-brand mx-auto mb-3" />
                <h3 className="font-bold text-[#0f1d33] mb-1">Super Admin Role</h3>
                <p className="text-sm text-[#5a6a82]">The Super Admin role is protected and automatically receives full Edit Access to all modules.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div>
            {message && (
              <div className={`flex items-center text-sm font-medium ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                {message.type === 'error' ? <Info className="w-4 h-4 mr-2" /> : null}
                {message.text}
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || !isDirty || isSuperAdmin}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#b09451] transition-colors disabled:opacity-50 shadow-sm shadow-brand/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Permissions
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
