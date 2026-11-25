'use client';

import { COMPANY_NAME } from '@/lib/site-config'

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users2,
  FolderKanban,
  Inbox,
  BarChart3,
  Send,
  Sliders,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Building2,
  UserCheck,
  Loader2,
  Megaphone
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { BrandLogo } from '@/app/crm/settings/brand-settings/BrandLogo';
import { getInboxUnreadCount } from '@/app/crm/inbox/actions';
import { getCompanyNameAction } from '@/app/crm/settings/company-actions';
import { COMPANY_NAME_CACHE_KEY, COMPANY_NAME_EVENT } from '@/lib/company-name';
import { ThemeToggle } from '@/components/ThemeToggle';

interface SidebarProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onNavigate?: () => void;
  userRole?: string;
  userName?: string;
  userEmail?: string;
  userPermissions?: Record<string, string> | null;
  isLoadingPermissions?: boolean;
  onNavigationStart?: (href: string) => void;
}

export function Sidebar({
  isCollapsed,
  toggleCollapse,
  onNavigate,
  userRole = '',
  userName = '',
  userEmail = '',
  userPermissions = null,
  isLoadingPermissions = false,
  onNavigationStart,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [inboxUnreadCount, setInboxUnreadCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;

    const fetchCount = async () => {
      try {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('crm_viewed_inbox_lead_ids') : null;
        const viewedIds: string[] = stored ? JSON.parse(stored) : [];
        const count = await getInboxUnreadCount(viewedIds);
        if (isMounted) {
          setInboxUnreadCount(count);
        }
      } catch (err) {
        // Fallback silently
      }
    };

    fetchCount();

    const handleCountUpdate = (e: any) => {
      if (typeof e.detail?.count === 'number') {
        setInboxUnreadCount(e.detail.count);
      }
    };

    const handleLeadRead = () => {
      // Optimistic decrement, then reconcile with the server's global count
      setInboxUnreadCount(prev => Math.max(0, prev - 1));
      fetchCount();
    };

    const handleRefresh = () => { fetchCount(); };
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchCount(); };

    // Poll so newly arrived Meta leads raise the badge without a page reload
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchCount();
    }, 60000);

    window.addEventListener('crm:inbox_count_update', handleCountUpdate);
    window.addEventListener('crm:inbox_read', handleLeadRead);
    window.addEventListener('crm:inbox_refresh', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      window.clearInterval(pollId);
      window.removeEventListener('crm:inbox_refresh', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('crm:inbox_count_update', handleCountUpdate);
      window.removeEventListener('crm:inbox_read', handleLeadRead);
    };
  }, []);

  const navItems = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      href: '/crm',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      id: 'leads',
      title: 'Leads',
      href: '/crm/leads',
      icon: Users2,
    },
    {
      id: 'meta',
      title: 'Meta',
      href: '/crm/meta',
      icon: Megaphone,
    },
    {
      id: 'projects',
      title: 'Projects',
      href: '/crm/projects',
      icon: FolderKanban,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      href: '/crm/inbox',
      icon: Inbox,
    },
    {
      id: 'bulk_sender',
      title: 'Bulk Sender',
      href: '/crm/bulk-sender',
      icon: Send,
    },
    {
      id: 'reports',
      title: 'Reports & Analytics',
      href: '/crm/reports',
      icon: BarChart3,
    },
    {
      id: 'modules',
      title: 'Modules & Access',
      href: '/crm/modules',
      icon: Sliders,
    },
    {
      id: 'users',
      title: 'User Management',
      href: '/crm/users',
      icon: ShieldCheck,
    },
    {
      id: 'settings',
      title: 'Settings',
      href: '/crm/settings',
      icon: Settings,
    },
  ];

  const visibleNavItems = navItems.filter((item) => {
    // HARD ENFORCEMENT: Modules and User Management are strictly reserved for Super Admin only
    if (item.id === 'modules' || item.id === 'users') {
      return userRole === 'Super Admin';
    }
    if (userRole === 'Super Admin') return true;
    if (!userPermissions) return false;
    const access = userPermissions[item.id] || (item.id === 'inbox' ? userPermissions['whatsapp'] : undefined);
    return access !== 'none';
  });

  const handleLogout = async () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('crm_user_session');
      }
      await supabase.auth.signOut();
      toast.success('Logged out successfully');
      router.push('/crm/login');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Error signing out');
    }
  };

  const companyName = COMPANY_NAME;

  // Company name under the logo (Settings → Company name). Cached so it shows instantly.
  const [sidebarCompanyName, setSidebarCompanyName] = useState('');
  useEffect(() => {
    try { setSidebarCompanyName(localStorage.getItem(COMPANY_NAME_CACHE_KEY) || ''); } catch {}
    getCompanyNameAction().then((r) => {
      setSidebarCompanyName(r.name);
      try { localStorage.setItem(COMPANY_NAME_CACHE_KEY, r.name); } catch {}
    }).catch(() => {});
    const onSaved = (e: Event) => setSidebarCompanyName(String((e as CustomEvent).detail || ''));
    window.addEventListener(COMPANY_NAME_EVENT, onSaved);
    return () => window.removeEventListener(COMPANY_NAME_EVENT, onSaved);
  }, []);
  const showCompanyName = !!sidebarCompanyName && !isCollapsed;

  return (
    <aside
      className={`relative flex flex-col h-full bg-white border-r border-[#e8ecf2] shadow-sm select-none transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center justify-center transition-all ${showCompanyName ? '' : 'border-b border-[#e8ecf2]'} ${
          isCollapsed ? 'h-20 px-2' : 'h-20 px-4'
        }`}
      >
        <Link
          href="/crm"
          onClick={onNavigate}
          className="flex items-center justify-center shrink-0 transition-opacity hover:opacity-90 max-w-full"
          title="Home"
        >
          <BrandLogo size={isCollapsed ? 'sm' : 'md'} showContainer={false} />
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-3 space-y-1 overflow-y-auto" suppressHydrationWarning>
        {/* Company name: same height as the Collapse button, line below only */}
        {showCompanyName && (
          <div className="mb-2 pb-2 border-b border-[#e8ecf2]/80">
            <div className="flex h-7.5 items-center justify-center px-2">
              <span className="truncate text-sm font-bold tracking-tight text-[#0f1d33]" title={sidebarCompanyName}>{sidebarCompanyName}</span>
            </div>
          </div>
        )}
        {/* Collapse toggle button: Positioned centered just above Dashboard */}
        <div className="hidden md:flex mb-2 pb-2 border-b border-[#e8ecf2]/80 justify-center">
          <button
            onClick={toggleCollapse}
            className={`flex items-center justify-center gap-1.5 h-7.5 rounded-lg text-xs font-semibold text-[#5a6a82] hover:text-[#0f1d33] hover:bg-[#f3f5f8] border border-transparent hover:border-[#e8ecf2] transition-all shrink-0 cursor-pointer ${
              isCollapsed ? 'w-8' : 'px-3 w-auto'
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-[#5a6a82]" />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5 text-[#5a6a82]" />
                <span className="text-xs font-medium text-[#5a6a82]">Collapse</span>
              </>
            )}
          </button>
        </div>
        {isLoadingPermissions && userRole !== 'Super Admin' ? (
          <div className="space-y-2 py-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-100/70 animate-pulse ${
                  isCollapsed ? 'justify-center' : ''
                }`}
              >
                <div className="w-5 h-5 bg-slate-200 rounded-md shrink-0" />
                {!isCollapsed && <div className="h-4 bg-slate-200/80 rounded w-28" />}
              </div>
            ))}
          </div>
        ) : (
          visibleNavItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
              onClick={() => {
                if (pathname !== item.href && onNavigationStart) {
                  onNavigationStart(item.href);
                }
                if (onNavigate) onNavigate();
              }}
              title={isCollapsed ? item.title : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[#0f1d33] text-white shadow-sm ring-1 ring-inset ring-white/10'
                  : 'text-[#5a6a82] hover:bg-[#f3f5f8] hover:text-[#0f1d33]'
              }`}
              style={
                isActive
                  ? {
                      borderLeft: '3px solid var(--crm-accent, #c4a55a)',
                    }
                  : undefined
              }
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <Icon
                  className="w-5 h-5 shrink-0 transition-colors"
                  style={{
                    color: isActive ? 'var(--crm-accent, #c4a55a)' : '#7a8b9e',
                  }}
                />
                {item.id === 'inbox' && inboxUnreadCount > 0 && isCollapsed && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[17px] h-4 flex items-center justify-center rounded-full text-[9px] font-black bg-red-500 text-white shadow-xs border border-white leading-none">
                    {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate">{item.title}</span>
                  {item.id === 'inbox' && inboxUnreadCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black bg-red-500 text-white shadow-xs leading-none animate-in fade-in duration-150">
                      {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        }))}
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-3 border-t border-[#e8ecf2] bg-[#fafbfc]">
        {/* Light / dark theme switch */}
        <div className={`hidden md:flex mb-2 pb-2 border-b border-[#e8ecf2]/80 ${isCollapsed ? 'justify-center' : ''}`}>
          <ThemeToggle compact={isCollapsed} />
        </div>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[#0f1d33] text-white font-bold text-xs shrink-0 shadow-xs"
              style={{
                boxShadow: '0 0 0 2px var(--crm-accent, #c4a55a)',
              }}
              title={`${userName || userEmail || 'User'} (${userRole})`}
            >
              {userName ? userName.charAt(0).toUpperCase() : (userEmail?.charAt(0).toUpperCase() || 'U')}
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="p-2 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 rounded-lg transition-colors shrink-0 shadow-2xs cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-red-600" />
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* User Profile Card */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#e8ecf2] shadow-2xs">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full bg-[#0f1d33] text-white font-bold text-xs shrink-0 shadow-xs"
                style={{
                  boxShadow: '0 0 0 2px var(--crm-accent, #c4a55a)',
                }}
              >
                {userName ? userName.charAt(0).toUpperCase() : (userEmail?.charAt(0).toUpperCase() || 'U')}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-xs font-bold text-[#0f1d33] truncate"
                  title={userName || userEmail || 'User'}
                >
                  {userName || userEmail?.split('@')[0] || 'User'}
                </span>
                <span className="text-[10px] font-semibold text-[#5a6a82] tracking-wide truncate capitalize">
                  {userRole || 'User'}
                </span>
              </div>
            </div>

            {/* Logout Button on Separate Line */}
            <button
              onClick={handleLogout}
              title="Log out"
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 rounded-xl transition-all shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
