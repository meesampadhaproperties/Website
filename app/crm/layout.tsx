'use client'

import { COMPANY_NAME } from '@/lib/site-config'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from "./dashboard/Sidebar"
import { createClient } from "@/lib/supabase/client"
import { getUserSessionPermissions } from "@/app/crm/users/actions"
import { Building2, Menu, X, Loader2 } from "lucide-react"
import Link from "next/link"
import { BrandLogo } from "./settings/brand-settings/BrandLogo"
import { getBrandSettingsAction } from "./settings/actions"
import { DEFAULT_BRAND_SETTINGS, saveStoredBrandSettings } from "@/lib/branding"
import { ThemeToggle } from "@/components/ThemeToggle"
import { applyTheme, readTheme } from "@/lib/theme"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/crm/login' || pathname === '/crm/reset-password'

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  // Phones scroll the document itself: freeze it while the slide-out menu is open
  useEffect(() => {
    if (!isMobileMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isMobileMenuOpen])
  const [isNavigating, setIsNavigating] = useState(false)

  const [userRole, setUserRole] = useState<string>('')
  const [userName, setUserName] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [userPermissions, setUserPermissions] = useState<Record<string, string> | null>(null)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState<boolean>(true)

  // Dark theme only inside the CRM (REQ-107)
  useEffect(() => {
    applyTheme(readTheme())
    return () => applyTheme('light')
  }, [])

  useEffect(() => {
    setIsNavigating(false)
  }, [pathname])

  useEffect(() => {
    if (isAuthPage) return

    // Immediately restore from client session storage right after mount/hydration
    try {
      const cached = sessionStorage.getItem('crm_user_session')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.role) setUserRole(parsed.role)
        if (parsed.name) setUserName(parsed.name)
        if (parsed.email) setUserEmail(parsed.email)
        if (parsed.permissions) {
          setUserPermissions(parsed.permissions)
          setIsLoadingPermissions(false)
        }
      }
    } catch {}

    async function fetchSession() {
      try {
        const session = await getUserSessionPermissions()
        if (session) {
          const role = session.role || ''
          const name = session.name || ''
          const email = session.email || ''
          const perms = session.permissions || {}

          setUserRole(role)
          setUserName(name)
          setUserEmail(email)
          setUserPermissions(perms)

          try {
            sessionStorage.setItem('crm_user_session', JSON.stringify({
              userId: session.userId || '',
              role,
              name,
              email,
              permissions: perms
            }))
          } catch {}

          // Load THIS user's branding from the database, so it applies on every device/browser
          try {
            const brand = await getBrandSettingsAction()
            if (brand.success) saveStoredBrandSettings({ ...DEFAULT_BRAND_SETTINGS, ...(brand.settings || {}) }, session.userId || undefined)
          } catch {}
        }
      } catch (err) {
        console.error('Failed to load session permissions in layout:', err)
      } finally {
        setIsLoadingPermissions(false)
      }
    }
    fetchSession()

    // Permissions change rarely: refetch only when the tab becomes visible again or an admin edits access.
    // (Previously this re-ran the full permission lookup on EVERY navigation.)
    // The sidebar is display-only; every page and server action still enforces access on the server.
    const onVisible = () => { if (document.visibilityState === 'visible') fetchSession() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('crm-permissions-changed', fetchSession)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('crm-permissions-changed', fetchSession)
    }
  }, [isAuthPage])

  // Auth pages (login, reset-password) render full screen without sidebar or mobile navigation
  if (isAuthPage) {
    return <>{children}</>
  }

  const companyName = COMPANY_NAME

  return (
    <div className="flex min-h-[100dvh] w-full bg-[#f7f8fa] md:h-[100dvh] md:overflow-hidden">
      {/* Phones: the browser scrolls the page itself (no inner scroll box), so mobile toolbars collapse and nothing is left unpainted.
          md: and up: fixed-height shell with <main> as the scroll area beside the sidebar. */}
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between bg-white/95 backdrop-blur-md border-b border-[#e8ecf2] h-16 px-4 shrink-0 fixed top-0 left-0 right-0 z-30 shadow-xs">
        <Link href="/crm" className="flex items-center gap-2 font-black text-lg tracking-wider text-[#0f1d33]" onClick={() => setIsMobileMenuOpen(false)}>
          <span>CRM</span>
        </Link>
        <div className="flex items-center gap-1">
        <ThemeToggle compact />
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          className="p-2.5 -mr-1.5 text-[#5a6a82] hover:text-[#0f1d33] active:bg-[#f1f5f9] rounded-xl transition-colors cursor-pointer" 
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#0f1d33]/50 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar - hidden on mobile by default, absolute and shown when menu is open */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64'}
        flex flex-col h-full bg-white md:bg-transparent shadow-xl md:shadow-none
      `}>
        <Sidebar 
          isCollapsed={isCollapsed} 
          toggleCollapse={() => setIsCollapsed(!isCollapsed)} 
          onNavigate={() => setIsMobileMenuOpen(false)}
          onNavigationStart={() => setIsNavigating(true)}
          userRole={userRole}
          userName={userName}
          userEmail={userEmail}
          userPermissions={userPermissions}
          isLoadingPermissions={isLoadingPermissions}
        />
      </div>
      
      {/* Top Navigation Loading Indicator */}
      {isNavigating && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-[#0f1d33] via-brand to-[#0f1d33] animate-pulse shadow-sm" />
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-x-clip md:overflow-x-hidden md:overflow-y-auto p-3.5 sm:p-5 md:p-8 pt-20 md:pt-8 w-full flex flex-col md:min-h-0 relative">
        {/* shrink-0 (no min-h-0): the wrapper grows with the page; a viewport-locked wrapper let pages overflow it, which mobile browsers left unpainted (cut-off bottom) */}
        <div className="mx-auto max-w-7xl w-full flex-1 shrink-0 flex flex-col">
          {isNavigating ? (
            <div className="flex h-[60vh] w-full flex-col items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-[#e8ecf2] shadow-sm">
                <Loader2 className="h-6 w-6 animate-spin text-[#0f1d33]" />
              </div>
              <p className="text-xs font-semibold text-[#5a6a82]">Loading content...</p>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  )
}
