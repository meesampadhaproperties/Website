'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Users, 
  Database, 
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Mail,
  X,
  RefreshCw,
  Tag,
  CalendarClock
} from "lucide-react";
import { getDashboardStats, getDashboardLeads } from "./dashboard/actions";
import { getTodayBoundsIst } from "@/lib/timezone";
import FollowUpButton from "@/components/FollowUpButton";
import FollowUpDialog from "@/components/FollowUpDialog";

/** Card id for leads with a pending follow up (any status). Follow up is not a status. */
const FOLLOW_UPS_CARD = 'follow_ups';

interface LeadStatus {
  id: string;
  name: string;
  key: string;
  color_bg: string;
  color_text: string;
  color_border?: string;
  description?: string | null;
  sort_order: number;
  is_system?: boolean;
}

const DEFAULT_FALLBACK_STATUSES: LeadStatus[] = [
  { id: '1', name: 'New', key: 'new', color_bg: 'bg-blue-50', color_text: 'text-blue-700', color_border: 'border-blue-200', sort_order: 1 },
  { id: '2', name: 'Uncontacted', key: 'uncontacted', color_bg: 'bg-amber-50', color_text: 'text-amber-700', color_border: 'border-amber-200', sort_order: 2 },
  { id: '3', name: 'Contacted', key: 'contacted', color_bg: 'bg-indigo-50', color_text: 'text-indigo-700', color_border: 'border-indigo-200', sort_order: 3 },
  { id: '4', name: 'Qualified', key: 'qualified', color_bg: 'bg-emerald-50', color_text: 'text-emerald-700', color_border: 'border-emerald-200', sort_order: 4 },
  { id: '5', name: 'Closed', key: 'closed', color_bg: 'bg-teal-50', color_text: 'text-teal-700', color_border: 'border-teal-200', sort_order: 5 },
  { id: '6', name: 'Rejected', key: 'rejected', color_bg: 'bg-red-50', color_text: 'text-red-700', color_border: 'border-red-200', sort_order: 6 },
];

export default function DashboardClient({ canEditFollowUps = false }: { canEditFollowUps?: boolean }) {
  // Follow ups can be changed right here, same popup as the Leads page
  const [followUpLead, setFollowUpLead] = useState<any | null>(null);
  const [tableReload, setTableReload] = useState(0);
  const [totalLeads, setTotalLeads] = useState<number | null>(null);
  const [todaysLeads, setTodaysLeads] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [followUpCount, setFollowUpCount] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Follow Ups is the first card and is selected by default
  const [selectedFilter, setSelectedFilter] = useState<{ id: string; title: string } | null>({ id: FOLLOW_UPS_CARD, title: 'Follow Ups' });
  const [tableLeads, setTableLeads] = useState<any[]>([]);
  const [tableCount, setTableCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const pageSize = 50;

  // Access to the dashboard is enforced on the SERVER (app/crm/page.tsx → requireAccess('dashboard')).

  const fetchDashboardData = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      // Server action (permission-checked, exact DB aggregates). Leads are not readable from the browser.
      const res = await getDashboardStats();
      const activeStatuses: LeadStatus[] = res.statuses.length > 0 ? res.statuses : DEFAULT_FALLBACK_STATUSES;
      setStatuses(activeStatuses);
      setTotalLeads(res.total);
      setTodaysLeads(res.today);
      setFollowUpCount(res.followUps);
      const counts: Record<string, number> = {};
      activeStatuses.forEach((st) => { counts[st.key.toLowerCase()] = res.statusCounts[st.key.toLowerCase()] || 0; });
      setStatusCounts(counts);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Fetch filtered leads for the table below when a card is selected
  useEffect(() => {
    if (!selectedFilter) return;
    const filterId = selectedFilter.id;

    async function fetchFilteredLeads() {
      setIsTableLoading(true);
      const res = await getDashboardLeads(filterId, currentPage, pageSize);
      if (!res.error) {
        setTableLeads(res.data);
        setTableCount(res.count);
      }
      setIsTableLoading(false);
    }

    fetchFilteredLeads();
  }, [selectedFilter, currentPage, tableReload]);

  const handleCardClick = (id: string, title: string) => {
    if (selectedFilter?.id === id) {
      setSelectedFilter(null);
    } else {
      setSelectedFilter({ id, title });
      setCurrentPage(1);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= Math.ceil(tableCount / pageSize)) {
      setCurrentPage(newPage);
    }
  };

  const isFollowUpView = selectedFilter?.id === FOLLOW_UPS_CARD;

  // Dynamic Badge resolver for lead records in the table
  const getStatusBadge = (statusKey: string) => {
    const normalized = (statusKey || 'new').toLowerCase().trim();
    const found = statuses.find(
      (s) => s.key.toLowerCase() === normalized || s.name.toLowerCase() === normalized
    );
    if (found) {
      return {
        name: found.name,
        badgeStyle: `${found.color_bg} ${found.color_text} ${found.color_border || 'border-transparent'}`,
      };
    }
    // Fallback styling for standard names
    if (normalized === 'new') return { name: 'New', badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (normalized === 'contacted') return { name: 'Contacted', badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    if (normalized === 'uncontacted') return { name: 'Uncontacted', badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (normalized === 'qualified') return { name: 'Qualified', badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (normalized === 'closed') return { name: 'Closed', badgeStyle: 'bg-teal-50 text-teal-700 border-teal-200' };
    if (normalized === 'rejected') return { name: 'Rejected', badgeStyle: 'bg-red-50 text-red-700 border-red-200' };
    return { name: statusKey || 'Unknown', badgeStyle: 'bg-gray-100 text-gray-700 border-gray-200' };
  };

  return (
    <div className="space-y-8">
      {followUpLead && (
        <FollowUpDialog
          lead={followUpLead}
          canEdit={canEditFollowUps}
          onClose={() => setFollowUpLead(null)}
          onChange={(state) => {
            setTableLeads((prev) => prev.map((l) => (l.id === followUpLead.id ? { ...l, ...state } : l)));
            fetchDashboardData();
            if (isFollowUpView) setTableReload((k) => k + 1);
          }}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0f1d33]">Dashboard Insights</h1>
          <p className="mt-1 text-sm text-[#5a6a82]">
            Dynamic overview of your CRM pipeline stages and lead metrics.
          </p>
        </div>
        <button
          onClick={() => fetchDashboardData()}
          disabled={isLoadingStats}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 text-xs font-medium text-[#1e3a5f] bg-white border border-[#e8ecf2] hover:bg-[#f8fafc] active:bg-[#e8ecf2] rounded-lg shadow-xs transition-colors self-start sm:self-center min-h-[38px] sm:min-h-0 touch-manipulation"
          title="Refresh KPI counts"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Dynamic KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
        {/* Follow Ups: pending follow ups on any status (always first, selected by default) */}
        <DashboardCard
          title="Follow Ups"
          value={followUpCount !== null ? followUpCount.toString() : (isLoadingStats ? '...' : '0')}
          description="Scheduled follow ups"
          icon={<CalendarClock className="h-4 w-4 text-orange-600" />}
          onClick={() => handleCardClick(FOLLOW_UPS_CARD, 'Follow Ups')}
          isSelected={selectedFilter?.id === FOLLOW_UPS_CARD}
        />

        {/* Fixed Overview: Total Leads */}
        <DashboardCard 
          title="Total Leads" 
          value={totalLeads !== null ? totalLeads.toString() : '...'} 
          description="All time leads"
          icon={<Database className="h-4 w-4 text-[#5a6a82]" />}
          onClick={() => handleCardClick('total', 'Total Leads')}
          isSelected={selectedFilter?.id === 'total'}
        />

        {/* Fixed Overview: Today's Leads */}
        <DashboardCard 
          title="Today's Leads" 
          value={todaysLeads !== null ? todaysLeads.toString() : '...'} 
          description="Leads received today"
          icon={<Users className="h-4 w-4 text-[#5a6a82]" />} 
          onClick={() => handleCardClick('todays', "Today's Leads")}
          isSelected={selectedFilter?.id === 'todays'}
        />

        {/* Dynamic Pipeline Stage Cards based on Lead Statuses & Badges */}
        {statuses.map((st) => {
          const count = statusCounts[st.key.toLowerCase()];
          const displayCount = count !== undefined ? count.toString() : (isLoadingStats ? '...' : '0');

          return (
            <DashboardCard 
              key={st.id || st.key}
              title={st.name}
              value={displayCount}
              description={st.description || `${st.name} pipeline stage`}
              badge={
                <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border ${st.color_bg} ${st.color_text} ${st.color_border || 'border-transparent'} max-w-full`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />
                  <span className="truncate">{st.name}</span>
                </span>
              }
              sortOrder={st.sort_order}
              onClick={() => handleCardClick(st.key, `${st.name} Leads`)}
              isSelected={selectedFilter?.id === st.key}
            />
          );
        })}
      </div>

      {/* Filtered Leads Details Drawer / Table */}
      {selectedFilter && (
        <div className="rounded-xl border border-[#e8ecf2] bg-white shadow-sm flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="px-4 sm:px-6 py-4 border-b border-[#e8ecf2] bg-[#f8fafc] flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-[#0f1d33]">{selectedFilter.title}</h2>
              <span className="text-xs text-[#5a6a82] bg-white px-2 py-0.5 rounded border border-[#e8ecf2]">
                {tableCount} {tableCount === 1 ? 'lead' : 'leads'}
              </span>
            </div>
            <button 
              onClick={() => setSelectedFilter(null)} 
              className="p-1 rounded-md text-[#5a6a82] hover:bg-[#e8ecf2] transition-colors"
              aria-label="Close details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-auto max-h-[60vh]">
            <table className="w-full text-xs text-left relative">
              <thead className="bg-[#f7f8fa] text-[#5a6a82] sticky top-0 z-10 border-b border-[#e8ecf2]">
                <tr>
                  <th className="px-4 py-3 font-medium w-20 whitespace-nowrap text-[#1e3a5f]">Sr. No</th>
                  <th className="px-4 py-3 font-medium text-[#1e3a5f]">Lead Info</th>
                  <th className="px-4 py-3 font-medium text-[#1e3a5f]">Source</th>
                  <th className="px-4 py-3 font-medium text-[#1e3a5f]">Status</th>
                  <th className="px-4 py-3 font-medium text-[#1e3a5f]">Follow up</th>
                  <th className="px-4 py-3 font-medium text-[#1e3a5f]">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ecf2]">
                {isTableLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#5a6a82]">Loading leads...</td>
                  </tr>
                ) : tableLeads.length > 0 ? (
                  tableLeads.map((lead, index) => {
                    const badgeInfo = getStatusBadge(lead.status);
                    return (
                      <tr key={lead.id} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-4 py-3 font-mono text-[#5a6a82]">
                          {(currentPage - 1) * pageSize + index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#0f1d33]">{lead.name || 'Unnamed Lead'}</div>
                          <div className="text-xs text-[#5a6a82] flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" /> {lead.phone || 'No phone'}
                          </div>
                          {lead.email && (
                            <div className="text-xs text-[#5a6a82] flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" /> {lead.email}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 bg-[#f3f5f8] text-[#5a6a82] px-2 py-1 rounded text-[10px] font-medium border border-[#e8ecf2]">
                            {lead.source_page || 'Direct / Form'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeInfo.badgeStyle}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                            {badgeInfo.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <FollowUpButton lead={lead} canEdit={canEditFollowUps} onClick={() => setFollowUpLead(lead)} />
                          {lead.follow_up_note && <p className="mt-1 line-clamp-2 text-xs text-[#5a6a82]" title={lead.follow_up_note}>{lead.follow_up_note}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#5a6a82]">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            {new Date(lead.created_at).toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#5a6a82]">No leads found for this stage.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden divide-y divide-[#e8ecf2] max-h-[60vh] overflow-y-auto">
            {isTableLoading ? (
              <div className="p-8 text-center text-[#5a6a82] text-sm">Loading leads...</div>
            ) : tableLeads.length > 0 ? (
              tableLeads.map((lead) => {
                const badgeInfo = getStatusBadge(lead.status);
                return (
                  <div key={lead.id} className="p-4 space-y-2 hover:bg-[#f8fafc] transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm text-[#0f1d33]">{lead.name || 'Unnamed Lead'}</div>
                        <a href={`tel:${lead.phone}`} className="text-xs text-[#1e3a5f] font-medium flex items-center gap-1 mt-0.5 hover:underline">
                          <Phone className="h-3 w-3 text-emerald-600" /> {lead.phone}
                        </a>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeInfo.badgeStyle}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                        {badgeInfo.name}
                      </span>
                    </div>

                    <div className="pt-1">
                      <FollowUpButton lead={lead} canEdit={canEditFollowUps} size="md" onClick={() => setFollowUpLead(lead)} />
                      {lead.follow_up_note && <p className="mt-1 line-clamp-2 text-xs text-[#5a6a82]">{lead.follow_up_note}</p>}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#5a6a82]">
                      <span className="inline-flex items-center gap-1 bg-[#f3f5f8] px-2 py-0.5 rounded text-[10px] font-medium border border-[#e8ecf2] text-[#1e3a5f]">
                        {lead.source_page || 'Direct / Form'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <Clock className="h-3 w-3" />
                        {new Date(lead.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-[#5a6a82] text-sm">No leads found for this stage.</div>
            )}
          </div>

          {/* Pagination */}
          {tableCount > pageSize && (
            <div className="flex items-center justify-between border-t border-[#e8ecf2] bg-white px-4 py-3 sm:px-6">
              {/* Mobile pagination */}
              <div className="flex flex-1 justify-between items-center sm:hidden">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || isTableLoading}
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 min-h-[38px] touch-manipulation"
                >
                  Previous
                </button>
                <div className="text-xs text-[#5a6a82] font-medium px-2">
                  Page {currentPage} of {Math.max(1, Math.ceil(tableCount / pageSize))}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage * pageSize >= tableCount || isTableLoading}
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3.5 py-2 text-xs font-medium text-black hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 min-h-[38px] touch-manipulation"
                >
                  Next
                </button>
              </div>

              {/* Desktop pagination */}
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, tableCount)}</span> of{' '}
                    <span className="font-medium">{tableCount}</span> results
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || isTableLoading}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-black ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      <ChevronLeft className="h-5 w-5 text-black" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage * pageSize >= tableCount || isTableLoading}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-black ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      <ChevronRight className="h-5 w-5 text-black" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardCard({ 
  title, 
  value, 
  description, 
  icon,
  badge,
  sortOrder,
  onClick,
  isSelected
}: { 
  title: string; 
  value: string; 
  description: string; 
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  sortOrder?: number;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  return (
    <div 
      onClick={onClick}
      className={`rounded-xl border transition-all cursor-pointer p-3 sm:p-4 md:p-5 shadow-xs hover:shadow-md flex flex-col justify-between active:scale-[0.99] touch-manipulation min-w-0 ${
        isSelected 
          ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/30 bg-blue-50/15' 
          : 'border-[#e8ecf2] hover:border-brand bg-white'
      }`}
    >
      <div className="flex flex-row items-center justify-between pb-1.5 sm:pb-2 gap-1.5 min-w-0">
        {badge ? (
          <div className="flex items-center justify-between w-full min-w-0 gap-1.5">
            <div className="min-w-0 flex-1 truncate">{badge}</div>
            {sortOrder !== undefined && (
              <span className="text-[9px] sm:text-[10px] font-mono font-medium text-[#5a6a82] bg-[#f8fafc] px-1.5 py-0.5 rounded border border-[#e8ecf2] shrink-0">
                #{sortOrder}
              </span>
            )}
          </div>
        ) : (
          <>
            <h3 className={`text-xs sm:text-sm font-semibold tracking-tight truncate ${isSelected ? 'text-[#1e3a5f]' : 'text-[#0f1d33]'}`}>
              {title}
            </h3>
            {icon}
          </>
        )}
      </div>
      <div className="mt-1 sm:mt-2">
        <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#0f1d33] tracking-tight truncate">{value}</div>
        <p className="text-[10px] sm:text-xs text-[#5a6a82] mt-0.5 sm:mt-1 truncate">{description}</p>
      </div>
    </div>
  );
}
