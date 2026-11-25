'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { 
  Inbox, 
  Download, 
  X, 
  ArrowRight, 
  Clock, 
  MessageSquare, 
  Phone, 
  Mail, 
  Building, 
  FileText,
  FolderKanban,
  ChevronDown,
  FilterX,
  MessageSquareText,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Smartphone
} from 'lucide-react'
import { toast } from 'sonner'
import { getInboxLeadsWithActivity, type InboxDateRange } from './actions'
import { updateLeadStatus } from '../leads/actions'
import { formatMetaAnswerValue } from '@/lib/meta'
import FollowUpButton from '@/components/FollowUpButton'
import FollowUpDialog from '@/components/FollowUpDialog'
import { activityLabel, isFollowUpActivity } from '@/lib/lead-status'
import { EnquiryBadge, EnquiryHistoryDialog } from '@/components/EnquiryHistory'
import LeadProjectChips from '@/components/LeadProjectChips'
import MessageComposer, { type MessageChannel } from '@/components/MessageComposer'

const DATE_RANGE_OPTIONS: { value: InboxDateRange; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
]

const FALLBACK_STATUSES: Array<{ id?: string; key: string; name: string }> = [
  { key: 'new', name: 'New' },
  { key: 'contacted', name: 'Contacted' },
  { key: 'qualified', name: 'Qualified' },
  { key: 'closed', name: 'Closed' },
]

const FALLBACK_STATUS_STYLES: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  contacted: 'bg-blue-50 text-blue-700 border-blue-200',
  uncontacted: 'bg-orange-50 text-orange-700 border-orange-200',
  qualified: 'bg-purple-50 text-purple-700 border-purple-200',
  site_visit_scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  site_visit_done: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  negotiation: 'bg-amber-50 text-amber-700 border-amber-200',
  booked: 'bg-teal-50 text-teal-700 border-teal-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200',
}

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className} 
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

interface WhatsAppLinkResult {
  isValid: boolean;
  phoneDigits: string;
  formattedDisplay: string;
  url: string | null;
  errorReason?: 'missing' | 'too_short' | 'dummy_pattern' | 'invalid_format';
}

function resolveWhatsAppLink(
  phone: string | null | undefined, 
  name?: string | null, 
  project?: string | null
): WhatsAppLinkResult {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      phoneDigits: '',
      formattedDisplay: '',
      url: null,
      errorReason: 'missing'
    };
  }

  const trimmed = phone.trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'none') {
    return {
      isValid: false,
      phoneDigits: '',
      formattedDisplay: '',
      url: null,
      errorReason: 'missing'
    };
  }

  // Strip all non-digit characters
  const digits = trimmed.replace(/\D/g, '');

  // Edge case: empty or less than 10 digits
  if (digits.length < 10) {
    return {
      isValid: false,
      phoneDigits: digits,
      formattedDisplay: trimmed,
      url: null,
      errorReason: 'too_short'
    };
  }

  // Edge case: all identical repeating dummy digits (e.g. 0000000000, 1111111111, 9999999999)
  if (/^(\d)\1+$/.test(digits)) {
    return {
      isValid: false,
      phoneDigits: digits,
      formattedDisplay: trimmed,
      url: null,
      errorReason: 'dummy_pattern'
    };
  }

  // Canonicalize phone for WhatsApp wa.me link:
  // If 10 digits starting with 6, 7, 8, 9 (standard Indian mobile): prepend 91
  let canonical = digits;
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    canonical = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // 09876543210 -> strip leading 0 and prepend 91
    canonical = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    canonical = digits;
  }
  // Otherwise, international format (11-15 digits) preserved

  if (canonical.length < 10 || canonical.length > 15) {
    return {
      isValid: false,
      phoneDigits: canonical,
      formattedDisplay: trimmed,
      url: null,
      errorReason: 'invalid_format'
    };
  }

  const cleanName = name && name.trim() && name !== 'Anonymous Lead' ? name.trim() : '';
  const cleanProject = project && project.trim() && project !== '-' ? project.trim() : '';

  const greeting = cleanName
    ? (cleanProject
        ? `Hi ${cleanName}, thank you for reaching out regarding ${cleanProject}. How can we assist you today?`
        : `Hi ${cleanName}, thank you for reaching out. How can we assist you today?`)
    : (cleanProject
        ? `Hello, thank you for reaching out regarding ${cleanProject}. How can we assist you today?`
        : `Hello, thank you for reaching out. How can we assist you today?`);

  const url = `https://wa.me/${canonical}?text=${encodeURIComponent(greeting)}`;

  return {
    isValid: true,
    phoneDigits: canonical,
    formattedDisplay: `+${canonical}`,
    url
  };
}

export interface InboxProject {
  id: string
  name: string
  client_name?: string
}

export interface InboxForm {
  id: string
  form_id: string
  name: string
  project_id?: string
  project_name?: string
}

const extractIncomingMessage = (details: string) => {
  if (!details) return '(no text content)';
  
  const lines = details.split('\n');
  const msgLine = lines.find(l => l.startsWith('Message: '));
  
  if (msgLine) {
    let msg = msgLine.replace('Message: ', '').trim();
    if (msg.startsWith('"') && msg.endsWith('"')) {
      msg = msg.slice(1, -1);
    }
    if (msg && msg !== '(no text content)') {
      return msg;
    }
  }

  // Fallback for historical/interactive/ad records where Message was logged as '(no text content)'
  const selectionLine = lines.find(l => l.startsWith('Selection: '));
  if (selectionLine) {
    const rawSelection = selectionLine.replace('Selection: ', '').trim();
    const cleaned = rawSelection.replace(/^(area_|proj_|action_)/, '').replace(/_/g, ' ');
    if (cleaned) return `Selected: ${cleaned}`;
  }

  const referralTypeLine = lines.find(l => l.startsWith('WhatsApp referral source type: '));
  const ctwaLine = lines.find(l => l.startsWith('Click-to-WhatsApp ID: '));
  if (referralTypeLine || ctwaLine) {
    return 'Ad Interaction (Click-to-WhatsApp)';
  }

  const typeLine = lines.find(l => l.startsWith('Type: '));
  if (typeLine) {
    const typeVal = typeLine.replace('Type: ', '').trim().toLowerCase();
    if (typeVal === 'unsupported') {
      const isReferral = lines.some(l => l.includes('referral') || l.includes('Click-to-WhatsApp'));
      return isReferral ? 'Ad Interaction (Click-to-WhatsApp)' : 'Chat Initiated (Ad CTA / Interactive Button)';
    }
    if (typeVal && typeVal !== 'text') {
      return `[${typeVal.charAt(0).toUpperCase() + typeVal.slice(1)} message]`;
    }
  }

  return msgLine ? '(no text content)' : details.trim() || '(no text content)';
};

const extractMediaInfo = (details: string) => {
  if (!details) return null;
  const lines = details.split('\n');
  const mediaLine = lines.find(l => l.startsWith('Media ID: '));
  const typeLine = lines.find(l => l.startsWith('Type: '));
  const mimeLine = lines.find(l => l.startsWith('MIME: '));
  if (!mediaLine) return null;
  const mediaId = mediaLine.replace('Media ID: ', '').trim();
  const type = typeLine ? typeLine.replace('Type: ', '').trim().toLowerCase() : '';
  const mime = mimeLine ? mimeLine.replace('MIME: ', '').trim().toLowerCase() : '';
  return { mediaId, type, mime };
};

const extractFormDetails = (lead: any, formsList?: Array<{ form_id: string; name: string }>) => {
  const source = lead.source_page || '';
  let id = lead.form_id || '-';
  let name = lead.form_name || '-';

  if (id === '-' && source.includes('Meta:')) {
    const raw = source.replace(/.*Meta:\s*/, '').trim();
    const match = raw.match(/^(.*?)\s*\((.*?)\)/);
    if (match) {
      name = match[1].trim();
      id = match[2].trim();
    }
  } else if (id === '-') {
    const genericMatch = source.match(/^(.*?)\s*\(([0-9]+)\)/);
    if (genericMatch) {
      name = genericMatch[1].trim();
      id = genericMatch[2].trim();
    }
  }

  // Look up actual form name from formsList if available
  if (formsList && formsList.length > 0 && id !== '-') {
    const matched = formsList.find(f => f.form_id === id);
    if (matched && matched.name) {
      name = matched.name;
    }
  }

  return { name, id };
};

const extractLeadMessageText = (lead: any) => {
  if (lead.message && lead.message.trim() && lead.message !== '(no text content)') {
    return lead.message.trim();
  }
  // Customer activity only: follow-up entries are CRM notes, not the lead's message
  const activities = (lead.lead_activities || []).filter((a: any) => !isFollowUpActivity(a.activity_type));
  if (activities.length > 0) {
    for (let i = activities.length - 1; i >= 0; i--) {
      const desc = activities[i].description;
      if (desc) {
        const parsed = extractIncomingMessage(desc);
        if (parsed && parsed !== '(no text content)') {
          return parsed;
        }
      }
    }
  }
  return '-';
};

export interface FormResponseField {
  label: string;
  value: string;
  category: 'question' | 'detail' | 'selection' | 'action';
  highlight?: boolean;
}

export interface DynamicFormDetailsData {
  formName: string;
  formId: string | null;
  sourceType: string;
  isMeta: boolean;
  isWhatsApp: boolean;
  submittedAt: string;
  contact: {
    name: string;
    phone: string;
    email: string;
    project: string;
    status: string;
  };
  fields: FormResponseField[];
  copyText: string;
}

export const extractDynamicFormResponses = (lead: any, formsList?: Array<{ form_id: string; name: string }>): DynamicFormDetailsData | null => {
  if (!lead) return null;

  const formInfo = extractFormDetails(lead, formsList);
  const fields: FormResponseField[] = [];
  const seenLabels = new Set<string>();

  const formatKeyToLabel = (rawKey: string): string => {
    if (!rawKey) return '';
    const trimmed = rawKey.trim();
    const lower = trimmed.toLowerCase();

    // Standard Meta Lead Ad fields
    if (lower === 'city') return 'City';
    if (lower === 'job_title' || lower === 'job title') return 'Job Title';
    if (lower === 'company_name' || lower === 'company name') return 'Company Name';
    if (lower === 'work_email' || lower === 'work email') return 'Work Email';
    if (lower === 'work_phone_number' || lower === 'work phone') return 'Work Phone';
    if (lower === 'street_address' || lower === 'address') return 'Street Address';
    if (lower === 'state') return 'State';
    if (lower === 'zip_code' || lower === 'postal_code' || lower === 'zip') return 'Postal Code / Zip';
    if (lower === 'country') return 'Country';
    if (lower === 'date_of_birth' || lower === 'dob') return 'Date of Birth';
    if (lower === 'gender') return 'Gender';

    // If it is a sentence or question (e.g. "what_is_your_approximate_budget?", "what is your preferred plot size?")
    let formatted = trimmed.replace(/[_-]+/g, ' ').trim();
    if (formatted.endsWith('?')) {
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    return formatted
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  };

  // Same rules as ingestion: only snake_case option keys are prettified; free text stays exactly as typed
  const formatAnswerValue = (val: any): string => formatMetaAnswerValue(val);

  const addField = (label: string, value: any, category: FormResponseField['category'] = 'question', highlight = false) => {
    if (value === null || value === undefined) return;
    const formattedVal = formatAnswerValue(value);
    if (!formattedVal || formattedVal === '-' || formattedVal === 'null' || formattedVal === 'undefined') return;

    const normalizedKey = label.trim().toLowerCase();
    if (seenLabels.has(normalizedKey)) return;
    seenLabels.add(normalizedKey);

    fields.push({
      label: label.trim(),
      value: formattedVal,
      category,
      highlight
    });
  };

  // 1. Direct lead standard attributes
  // Note: lead.project is the CRM campaign/project and is shown in the customer header card.
  // We only add property_interest if it represents a specific unit or sub-property distinct from the main project.
  if (lead.property_interest && lead.property_interest !== lead.project) {
    addField('Property Interested In', lead.property_interest, 'question');
  }
  if (lead.enquiry_type) {
    addField('Enquiry Type', lead.enquiry_type, 'question');
  }
  if (lead.downloaded_item) {
    addField('Requested / Downloaded Asset', lead.downloaded_item, 'question');
  }

  // 2. Parse lead_activities (Meta form submissions, webhook raw payloads, WhatsApp selections)
  const activities = lead.lead_activities || [];
  activities.forEach((act: any) => {
    // CRM-internal activities (follow ups) are not customer form answers
    if (isFollowUpActivity(act.activity_type)) return;

    // 2a. Check jsonb metadata
    const metaObj = act.metadata && typeof act.metadata === 'object' ? act.metadata : null;
    if (metaObj && Array.isArray(metaObj._answers) && metaObj._answers.length > 0) {
      // Preferred: answers labelled with the form's real question text & option labels
      metaObj._answers.forEach((a: any) => addField(String(a.question || a.key || ''), a.answer, 'question'));
    } else if (metaObj) {
      Object.entries(metaObj).forEach(([k, v]) => {
        if (k.startsWith('_')) return; // internal ids (_leadgen_id, _form_id)
        const kLower = k.toLowerCase().trim();
        if (['full_name', 'fullname', 'first_name', 'last_name', 'name', 'phone', 'phone_number', 'email'].includes(kLower)) {
          return;
        }
        addField(formatKeyToLabel(k), Array.isArray(v) ? v.join(', ') : v, 'question');
      });
    }

    // 2b. Check act.details or act.description if string JSON.
    // When structured metadata exists, the description is just a system log line ("Captured from ... (Form ID: x)"):
    // parsing it as "Question: Answer" produced bogus fields, so skip it.
    const hasStructuredAnswers = !!metaObj && Object.keys(metaObj).length > 0;
    const rawDetails = hasStructuredAnswers ? '' : (act.details || act.description);
    if (rawDetails && (rawDetails.trim().startsWith('{') || rawDetails.trim().startsWith('['))) {
      try {
        const parsed = JSON.parse(rawDetails);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([k, v]) => {
            const kLower = k.toLowerCase().trim();
            if (['full_name', 'fullname', 'first_name', 'last_name', 'name', 'phone', 'phone_number', 'email'].includes(kLower)) {
              return;
            }
            addField(formatKeyToLabel(k), Array.isArray(v) ? v.join(', ') : v, 'question');
          });
        }
      } catch {
        // Fallback to text parsing
      }
    }

    if (rawDetails && typeof rawDetails === 'string') {
      const lines = rawDetails.split('\n');
      lines.forEach((line: string) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('Selection: ')) {
          const val = trimmed.replace('Selection: ', '').replace(/^(area_|proj_|action_)/, '').replace(/_/g, ' ').trim();
          addField('Option Selected in Chat', val, 'selection', true);
        } else if (trimmed.startsWith('WhatsApp referral source type: ')) {
          const val = trimmed.replace('WhatsApp referral source type: ', '').trim();
          addField('Ad Referral Source', `WhatsApp Ad (${val})`, 'detail');
        } else if (trimmed.startsWith('Click-to-WhatsApp ID: ')) {
          const val = trimmed.replace('Click-to-WhatsApp ID: ', '').trim();
          addField('Click-to-WhatsApp Ad ID', val, 'detail');
        } else if (trimmed.startsWith('Message: ')) {
          const val = trimmed.replace('Message: ', '').trim().replace(/^"|"$/g, '');
          if (val && val !== '(no text content)') {
            addField('User Inbound Message', val, 'question', true);
          }
        } else if (trimmed.includes(': ') && !trimmed.startsWith('Media ID:') && !trimmed.startsWith('Type:') && !trimmed.startsWith('MIME:')) {
          const [rawKey, ...rest] = trimmed.split(': ');
          const val = rest.join(': ').trim();
          const kLower = rawKey.toLowerCase();
          if (!['id', 'token', 'access_token', 'page_id', 'form_id', 'full_name', 'phone', 'email'].includes(kLower) && val) {
            addField(formatKeyToLabel(rawKey), val, 'question');
          }
        }
      });
    }

    if (act.activity_type === 'Requested Callback') {
      addField('Special Request', 'Customer requested a direct telephone callback', 'action', true);
    }
  });

  // 3. Parse lead.message
  if (lead.message && typeof lead.message === 'string') {
    const rawMsg = lead.message.trim();
    if (rawMsg.startsWith('{') && rawMsg.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawMsg);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            const kLower = k.toLowerCase().trim();
            if (!['full_name', 'fullname', 'name', 'phone', 'email'].includes(kLower)) {
              addField(formatKeyToLabel(k), Array.isArray(v) ? v.join(', ') : v, 'question');
            }
          });
        }
      } catch {
        // Fallback
      }
    } else {
      const lines = rawMsg.split('\n');
      let isAllKeyValues = true;
      const parsedKVs: { key: string; val: string }[] = [];

      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 2 && parts[0].trim().length < 60) {
          parsedKVs.push({ key: parts[0].trim(), val: parts.slice(1).join(':').trim() });
        } else {
          isAllKeyValues = false;
        }
      }

      if (isAllKeyValues && parsedKVs.length > 0) {
        parsedKVs.forEach(item => {
          addField(formatKeyToLabel(item.key), item.val, 'question');
        });
      } else if (
        rawMsg !== 'Meta Lead Ad Submission' && 
        rawMsg !== 'Meta Lead Form Submission' && 
        rawMsg !== 'Reconciled from Meta Lead Ad' &&
        rawMsg !== '(no text content)'
      ) {
        addField('Customer Submitted Message / Remarks', rawMsg, 'question', true);
      }
    }
  }

  // 4. Fallback for location if city wasn't already in fields
  if (lead.location && !seenLabels.has('city') && !seenLabels.has('location')) {
    addField('City', lead.location, 'question');
  }

  // 5. Source classification
  const sourceRaw = (lead.source_page || '').toLowerCase();
  let sourceTypeLabel = 'Direct Inquiry';
  let isMeta = false;
  let isWhatsApp = false;

  if (sourceRaw.includes('meta') || lead.form_id || formInfo.name.includes('Meta') || formInfo.id !== '-') {
    sourceTypeLabel = 'Meta Lead Ad Form';
    isMeta = true;
  } else if (sourceRaw.includes('whatsapp') || activities.some((a: any) => (a.activity_type || '').toLowerCase().includes('whatsapp'))) {
    sourceTypeLabel = 'WhatsApp Bot Interaction';
    isWhatsApp = true;
  } else if (sourceRaw.includes('contact') || sourceRaw.includes('web') || sourceRaw.includes('landing')) {
    sourceTypeLabel = 'Website Inquiry Form';
  }

  const dateFormatted = new Date(lead.created_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const lines = [
    `--- FORM SUBMISSION DETAILS ---`,
    `Form: ${formInfo.name !== '-' ? formInfo.name : (lead.project || 'Lead Form')}`,
    formInfo.id && formInfo.id !== '-' ? `Form ID: ${formInfo.id}` : null,
    `Source: ${sourceTypeLabel}`,
    `Submitted: ${dateFormatted} IST`,
    ``,
    `CUSTOMER DETAILS:`,
    `Name: ${lead.name || 'Anonymous'}`,
    `Phone: ${lead.phone || '-'}`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.project ? `Project: ${lead.project}` : null,
    ``,
    `FORM RESPONSES (${fields.length} answered):`,
    ...fields.map(f => `• ${f.label}: ${f.value}`),
    ``,
    `Status: ${(lead.status || 'new').toUpperCase()}`,
    `-------------------------------`
  ].filter(Boolean).join('\n');

  return {
    formName: formInfo.name !== '-' ? formInfo.name : (lead.project || 'Lead Form Inquiry'),
    formId: formInfo.id !== '-' ? formInfo.id : null,
    sourceType: sourceTypeLabel,
    isMeta,
    isWhatsApp,
    submittedAt: dateFormatted,
    contact: {
      name: lead.name || 'Anonymous Lead',
      phone: lead.phone || '',
      email: lead.email || '',
      project: lead.project || lead.property_interest || '-',
      status: lead.status || 'new'
    },
    fields,
    copyText: lines
  };
};

export default function InboxDashboardClient({ 
  initialLeads, 
  totalCount = 0, 
  userRole,
  projects = [],
  forms = [],
  statuses = [],
  canChangeStatus = false,
  canMessage = false
}: { 
  initialLeads: any[], 
  totalCount?: number, 
  initialAnalytics?: any,
  userRole: string,
  projects?: InboxProject[],
  forms?: InboxForm[],
  statuses?: Array<{ id?: string; key: string; name: string; color_bg?: string; color_text?: string; color_border?: string }>
  /** Changing a lead's status needs 'edit' on Leads (enforced by updateLeadStatus). */
  canChangeStatus?: boolean
  /** 'edit' on Inbox: may send Email / SMS (enforced by the messaging actions). */
  canMessage?: boolean
}) {
  const [leads, setLeads] = useState(initialLeads)
  const [formDetailsLead, setFormDetailsLead] = useState<any | null>(null)
  const [copiedFeedback, setCopiedFeedback] = useState(false)
  
  // Filter States
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedForm, setSelectedForm] = useState<string>('all')
  const [selectedDateRange, setSelectedDateRange] = useState<InboxDateRange>('all')
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const statusOptions = statuses.length > 0 ? statuses : FALLBACK_STATUSES
  const getStatusBadgeStyle = (statusKey?: string | null) => {
    const normalized = (statusKey || 'new').toLowerCase().trim()
    const found: any = statuses.find(st => st.key.toLowerCase() === normalized)
    if (found?.color_bg) return `${found.color_bg} ${found.color_text || ''} ${found.color_border || 'border-transparent'}`
    return FALLBACK_STATUS_STYLES[normalized] || 'bg-[#f3f5f8] text-[#1e3a5f] border-[#e8ecf2]'
  }

  const [currentPage, setCurrentPage] = useState(1)
  const [totalLeadsCount, setTotalLeadsCount] = useState(totalCount || initialLeads.length)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const isPageLoadingRef = useRef(false)
  const pageSize = 50

  // Dynamic available forms list
  const availableForms = useMemo(() => {
    const map = new Map<string, { id: string; form_id: string; name: string; project_name?: string }>();
    
    // 1. Registered forms from meta_forms
    forms.forEach(f => {
      if (f.form_id) {
        map.set(f.form_id, {
          id: f.id,
          form_id: f.form_id,
          name: f.name || `Form ${f.form_id}`,
          project_name: f.project_name
        });
      }
    });

    // 2. Any additional form IDs found in leads
    leads.forEach(l => {
      const fInfo = extractFormDetails(l);
      if (fInfo.id && fInfo.id !== '-' && !map.has(fInfo.id)) {
        map.set(fInfo.id, {
          id: fInfo.id,
          form_id: fInfo.id,
          name: fInfo.name !== '-' ? fInfo.name : `Form ${fInfo.id}`,
          project_name: l.project || l.property_interest
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [forms, leads]);

  // Filter forms based on selected project
  const filteredForms = useMemo(() => {
    if (selectedProject === 'all') return availableForms;
    return availableForms.filter(f => 
      !f.project_name || f.project_name.toLowerCase() === selectedProject.toLowerCase()
    );
  }, [availableForms, selectedProject]);

  const applyFilters = async (project: string, formId: string, dateRange: InboxDateRange = selectedDateRange) => {
    setIsPageLoading(true);
    isPageLoadingRef.current = true;
    try {
      const res = await getInboxLeadsWithActivity(1, pageSize, {
        project: project !== 'all' ? project : undefined,
        formId: formId !== 'all' ? formId : undefined,
        dateRange
      });
      setLeads(res.data || []);
      setTotalLeadsCount(res.count || 0);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error filtering inbox leads:', err);
    } finally {
      isPageLoadingRef.current = false;
      setIsPageLoading(false);
    }
  };

  const handleProjectChange = (newProject: string) => {
    setSelectedProject(newProject);
    let newForm = selectedForm;
    if (newProject !== 'all' && selectedForm !== 'all') {
      const formMatches = availableForms.some(
        f => f.form_id === selectedForm && (!f.project_name || f.project_name.toLowerCase() === newProject.toLowerCase())
      );
      if (!formMatches) {
        newForm = 'all';
        setSelectedForm('all');
      }
    }
    applyFilters(newProject, newForm);
  };

  const handleFormChange = (newForm: string) => {
    setSelectedForm(newForm);
    applyFilters(selectedProject, newForm);
  };

  const handleDateRangeChange = (range: InboxDateRange) => {
    setSelectedDateRange(range);
    applyFilters(selectedProject, selectedForm, range);
  };

  const handleClearFilters = () => {
    setSelectedProject('all');
    setSelectedForm('all');
    setSelectedDateRange('all');
    applyFilters('all', 'all', 'all');
  };

  // Ask the Sidebar to recompute the GLOBAL unread badge (not just this filtered page)
  const refreshSidebarBadge = () => {
    window.dispatchEvent(new CustomEvent('crm:inbox_refresh'));
  };

  // Follow ups are separate from status: the Follow up button opens this popup
  const [followUpLead, setFollowUpLead] = useState<any | null>(null);
  // "Enquired N×" → this person's enquiry history (matched by phone number)
  const [enquiryLead, setEnquiryLead] = useState<any | null>(null);
  // Send a custom Email / SMS to this lead (same composer as the Bulk Sender)
  const [composer, setComposer] = useState<{ leads: any[]; channel: MessageChannel } | null>(null);

  // Inline status tracking (same server action + phone-sync rules as Lead Pipeline)
  const handleStatusChange = async (lead: any, newStatus: string) => {
    const prevStatus = lead.status || 'new';
    if (newStatus === prevStatus) return;
    setUpdatingStatusId(lead.id);
    setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, status: newStatus } : l)));
    setFormDetailsLead((cur: any) => (cur?.id === lead.id ? { ...cur, status: newStatus } : cur));
    try {
      const res = await updateLeadStatus(lead.id, newStatus);
      if (!res.success) {
        setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, status: prevStatus } : l)));
        toast.error('Failed to update status', { description: res.error });
      } else {
        const label = statusOptions.find(st => st.key === newStatus)?.name || newStatus;
        toast.success(`Status updated to "${label}"`, res.syncedCount && res.syncedCount > 1
          ? { description: `Synced across ${res.syncedCount} inquiries with the same phone.` }
          : undefined);
      }
    } finally {
      setUpdatingStatusId(null);
      refreshSidebarBadge();
    }
  };

  const renderStatusSelect = (lead: any) => !canChangeStatus ? (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize border ${getStatusBadgeStyle(lead.status)}`}
      title="View only"
    >
      {statusOptions.find(st => st.key === (lead.status || 'new'))?.name || lead.status || 'new'}
    </span>
  ) : (
    <div className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <select
        value={lead.status || 'new'}
        disabled={updatingStatusId === lead.id}
        onChange={(e) => handleStatusChange(lead, e.target.value)}
        className={`appearance-none rounded-full pl-2.5 pr-6 py-1 text-[11px] font-semibold capitalize border cursor-pointer hover:opacity-85 transition-opacity focus:outline-none disabled:opacity-60 disabled:cursor-wait ${getStatusBadgeStyle(lead.status)}`}
        aria-label="Lead status"
      >
        {!statusOptions.some(st => st.key === (lead.status || 'new')) && (
          <option value={lead.status || 'new'} className="bg-white text-[#0f1d33]">{lead.status || 'new'}</option>
        )}
        {statusOptions.map(st => (
          <option key={st.id || st.key} value={st.key} className="bg-white text-[#0f1d33]">{st.name}</option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none opacity-70" />
    </div>
  );

  // Escape key dismiss & body scroll lock for Form Details modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The Follow up popup sits on top: Esc closes that one first
      if (e.key === 'Escape' && formDetailsLead && !followUpLead) {
        setFormDetailsLead(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [formDetailsLead, followUpLead])

  useEffect(() => {
    if (formDetailsLead) {
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = orig
      }
    }
  }, [formDetailsLead])

  const handlePageChange = async (newPage: number) => {
    if (isPageLoadingRef.current) return;
    if (newPage < 1 || newPage > Math.ceil(totalLeadsCount / pageSize)) return;
    isPageLoadingRef.current = true;
    setIsPageLoading(true);
    try {
      const res = await getInboxLeadsWithActivity(newPage, pageSize, {
        project: selectedProject !== 'all' ? selectedProject : undefined,
        formId: selectedForm !== 'all' ? selectedForm : undefined,
        dateRange: selectedDateRange
      });
      setLeads(res.data || []);
      setTotalLeadsCount(res.count || 0);
      setCurrentPage(newPage);
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      isPageLoadingRef.current = false;
      setIsPageLoading(false);
    }
  };

  // Process leads for the table
  const processedLeads = useMemo(() => {
    return leads.map(lead => {
      // "Last active" = the customer's last activity, not a CRM follow-up note
      const activities = (lead.lead_activities || []).filter((a: any) => !isFollowUpActivity(a.activity_type));
      const formInfo = extractFormDetails(lead, availableForms);
      const messageText = extractLeadMessageText(lead);
      const lastActive = activities.length > 0 ? activities[activities.length - 1].created_at : (lead.created_at || lead.updated_at);

      return {
        ...lead,
        formId: formInfo.id,
        formName: formInfo.name,
        messageText,
        lastActive
      };
    }).sort((a, b) => new Date(b.lastActive || b.created_at).getTime() - new Date(a.lastActive || a.created_at).getTime());
  }, [leads, availableForms]);

  // Track read/opened leads in localStorage for live unread notification tracking
  const [viewedLeadIds, setViewedLeadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem('crm_viewed_inbox_lead_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Calculate live unread count (leads with status 'new' or unset that haven't been opened yet)
  const unreadLeadsCount = useMemo(() => {
    return processedLeads.filter(l => (l.status === 'new' || !l.status) && !viewedLeadIds.has(l.id)).length;
  }, [processedLeads, viewedLeadIds]);

  // Keep the Sidebar badge in sync with the GLOBAL unread count whenever visible data changes.
  // (Previously this pushed the page-local count, so filters/pagination corrupted the badge.)
  useEffect(() => {
    refreshSidebarBadge();
  }, [unreadLeadsCount]);

  // Open lead form details & immediately reduce notification count
  const handleOpenLead = (lead: any) => {
    setFormDetailsLead(lead);

    if (!viewedLeadIds.has(lead.id)) {
      const nextSet = new Set(viewedLeadIds);
      nextSet.add(lead.id);
      setViewedLeadIds(nextSet);

      try {
        localStorage.setItem('crm_viewed_inbox_lead_ids', JSON.stringify(Array.from(nextSet)));
      } catch (err) {
        console.warn('Could not persist viewed lead ID to localStorage:', err);
      }

      window.dispatchEvent(new CustomEvent('crm:inbox_read', {
        detail: { leadId: lead.id }
      }));
    }
  };

  // Open direct WhatsApp chat with robust edge-case validation
  const handleOpenWhatsAppChat = (e: React.MouseEvent, lead: any) => {
    e.stopPropagation();

    const wa = resolveWhatsAppLink(lead.phone, lead.name, lead.project || lead.property_interest);

    if (!wa.isValid || !wa.url) {
      if (wa.errorReason === 'missing') {
        toast.error('No Phone Number Available', {
          description: `Lead "${lead.name || 'Anonymous'}" does not have a phone number on file.`
        });
      } else if (wa.errorReason === 'too_short') {
        toast.error('Invalid Phone Number', {
          description: `The number "${lead.phone}" is too short to be a valid phone number.`
        });
      } else if (wa.errorReason === 'dummy_pattern') {
        toast.error('Dummy Number Detected', {
          description: `The number "${lead.phone}" appears to be a test/dummy placeholder.`
        });
      } else {
        toast.error('Invalid Phone Format', {
          description: `Could not parse "${lead.phone}" into a valid phone format.`
        });
      }
      return;
    }

    toast.success('Opening WhatsApp', {
      description: `Opening chat with ${wa.formattedDisplay}. Note: If this number isn't registered on WhatsApp, WhatsApp will notify you.`
    });

    window.open(wa.url, '_blank', 'noopener,noreferrer');
  };

  const exportToCSV = () => {
    const headers = ['Sr. No', 'Name', 'Phone', 'Email', 'Project', 'Form ID', 'Form Name', 'Message', 'Date'];
    
    // Prevent CSV Formula Injection (CWE-1236): prefix leading =, +, -, @, \t, \r with '
    const sanitizeCsvField = (raw: string | null | undefined): string => {
      if (!raw) return '""';
      const str = raw.replace(/"/g, '""').replace(/\n/g, ' ');
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe}"`;
    };

    const csvContent = [
      headers.join(','),
      ...processedLeads.map((lead, index) => [
        (currentPage - 1) * pageSize + index + 1,
        sanitizeCsvField(lead.name),
        sanitizeCsvField(lead.phone),
        sanitizeCsvField(lead.email),
        sanitizeCsvField(lead.project || lead.property_interest || '-'),
        sanitizeCsvField(lead.formId || '-'),
        sanitizeCsvField(lead.formName || '-'),
        sanitizeCsvField(lead.messageText || '-'),
        sanitizeCsvField(new Date(lead.lastActive).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inbox_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-full bg-[#f7f8fa] md:overflow-hidden md:h-full">
      {enquiryLead && (
        <EnquiryHistoryDialog lead={enquiryLead} onClose={() => setEnquiryLead(null)} />
      )}
      {composer && <MessageComposer leads={composer.leads} initialChannel={composer.channel} onClose={() => setComposer(null)} />}
      {followUpLead && (
        <FollowUpDialog
          lead={followUpLead}
          canEdit={canChangeStatus}
          onClose={() => setFollowUpLead(null)}
          onChange={(state) => {
            setLeads(prev => prev.map(l => (l.id === followUpLead.id ? { ...l, ...state } : l)));
            setFormDetailsLead((cur: any) => (cur?.id === followUpLead.id ? { ...cur, ...state } : cur));
          }}
        />
      )}
      {/* Header Bar */}
      <div className="px-0 pt-1 pb-4 md:p-8 md:pb-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#0f1d33] flex flex-wrap items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-xl bg-[#0f1d33] flex items-center justify-center text-white shadow-xs">
                <Inbox className="h-5 w-5 text-white" />
                {unreadLeadsCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[17px] h-4 flex items-center justify-center rounded-full text-[9px] font-black bg-red-500 text-white shadow-xs border border-white leading-none">
                    {unreadLeadsCount > 99 ? '99+' : unreadLeadsCount}
                  </span>
                )}
              </div>
              <span>Inbox</span>
              {unreadLeadsCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  {unreadLeadsCount} Unread {unreadLeadsCount === 1 ? 'Inquiry' : 'Inquiries'}
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-[#5a6a82] mt-1">
              Incoming customer inquiries, messages, and form submissions.
            </p>
          </div>

          <button
            onClick={exportToCSV}
            className="inline-flex items-center justify-center gap-2 bg-[#0f1d33] hover:bg-[#1e3a5f] text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-[0.98] shrink-0"
          >
            <Download className="h-4 w-4" />
            Export Data
          </button>
        </div>
      </div>

      {/* Main Inbox Table Container */}
      <div className="flex-1 px-0 md:px-8 pb-4 md:pb-8 flex flex-col min-h-0">
        {/* Filter Bar (Reference from Lead Pipeline) */}
        <div className="bg-white rounded-xl border border-[#e8ecf2] p-4 shadow-xs mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto min-w-0">
            {/* Date Range Pills (IST) */}
            <div className="grid grid-cols-3 sm:flex w-full sm:w-auto items-center gap-1 bg-[#f3f5f8] border border-[#e8ecf2] rounded-lg p-1" role="group" aria-label="Date range">
              {DATE_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleDateRangeChange(opt.value)}
                  disabled={isPageLoading}
                  className={`min-h-[40px] sm:min-h-0 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer disabled:cursor-wait ${selectedDateRange === opt.value ? 'bg-[#0f1d33] text-white shadow-xs' : 'text-[#5a6a82] hover:bg-white hover:text-[#0f1d33]'}`}
                  aria-pressed={selectedDateRange === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-5 bg-[#e8ecf2]" />

            {/* Select Project Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a82] w-[84px] sm:w-auto shrink-0 whitespace-nowrap select-none flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-brand" />
                Project:
              </span>
              <div className="relative inline-flex items-center flex-1 min-w-0 sm:flex-initial">
                <select
                  value={selectedProject}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="appearance-none w-full min-w-0 sm:max-w-[280px] min-h-[44px] sm:min-h-0 text-ellipsis overflow-hidden whitespace-nowrap text-xs font-semibold bg-[#f3f5f8] border border-[#e8ecf2] text-[#0f1d33] rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-[#0f1d33] cursor-pointer hover:bg-[#e8ecf2] transition-colors"
                >
                  <option value="all">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} {p.client_name ? `(${p.client_name})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#5a6a82] absolute right-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-5 bg-[#e8ecf2]" />

            {/* Select Form Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a82] w-[84px] sm:w-auto shrink-0 whitespace-nowrap select-none flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#1e3a5f]" />
                Form:
              </span>
              <div className="relative inline-flex items-center flex-1 min-w-0 sm:flex-initial">
                <select
                  value={selectedForm}
                  onChange={(e) => handleFormChange(e.target.value)}
                  className="appearance-none w-full min-w-0 sm:max-w-[240px] min-h-[44px] sm:min-h-0 text-ellipsis overflow-hidden whitespace-nowrap text-xs font-semibold bg-[#f3f5f8] border border-[#e8ecf2] text-[#0f1d33] rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-[#0f1d33] cursor-pointer hover:bg-[#e8ecf2] transition-colors"
                >
                  <option value="all">All Forms</option>
                  {filteredForms.map((f) => (
                    <option key={f.id || f.form_id} value={f.form_id}>
                      {f.name} {f.form_id ? `(${f.form_id})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#5a6a82] absolute right-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Clear Filters */}
            {(selectedProject !== 'all' || selectedForm !== 'all' || selectedDateRange !== 'all') && (
              <button
                onClick={handleClearFilters}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200 cursor-pointer"
                title="Reset date, project and form filters"
              >
                <FilterX className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            )}
          </div>

          {/* Showing X inquiries badge */}
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a6a82] bg-[#f8fafc] px-3.5 py-2 rounded-lg border border-[#e8ecf2] shrink-0 self-start md:self-auto ml-auto">
            <span>Showing</span>
            <span className="font-bold text-[#0f1d33]">{totalLeadsCount}</span>
            <span>{totalLeadsCount === 1 ? 'inbox inquiry' : 'inbox inquiries'}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e8ecf2] shadow-xs flex flex-col md:overflow-hidden h-auto md:h-full">
          {/* Desktop Table View: fixed layout that fits the screen (no sideways scrolling).
              Tablets and phones get the card view below. */}
          <div className="hidden lg:block overflow-y-auto overflow-x-hidden">
            <table className="w-full table-fixed text-left text-xs text-[#5a6a82] relative">
              <thead className="bg-[#f3f5f8] text-xs uppercase font-semibold text-[#1e3a5f] sticky top-0 z-10 border-b border-[#e8ecf2]">
                <tr>
                  <th className="px-3 py-3 w-12">#</th>
                  <th className="px-3 py-3 w-[25%]">Lead</th>
                  <th className="px-3 py-3 w-[22%]">Project / Form</th>
                  <th className="hidden xl:table-cell px-3 py-3">Message</th>
                  <th className="px-3 py-3 w-[156px]">Status</th>
                  <th className="px-3 py-3 w-[186px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ecf2]">
                {processedLeads.length > 0 ? (
                  processedLeads.map((lead) => {
                    const isUnread = (lead.status === 'new' || !lead.status) && !viewedLeadIds.has(lead.id);
                    const wa = resolveWhatsAppLink(lead.phone, lead.name, lead.project || lead.property_interest);
                    const iconBtn = 'relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
                    return (
                    <tr key={lead.id} className="align-top hover:bg-[#f8fafc] transition-colors">
                      <td className="px-3 py-3 font-semibold text-[#5a6a82]">
                        {(currentPage - 1) * pageSize + processedLeads.indexOf(lead) + 1}
                      </td>

                      {/* Lead */}
                      <td className="px-3 py-3 cursor-pointer" onClick={() => handleOpenLead(lead)}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-[#0f1d33] hover:text-[#1e3a5f]" title={lead.name || ''}>{lead.name || 'Anonymous Lead'}</span>
                          {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse" title="New unread lead" />}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0 text-[#8a99ad]" />
                          <span className="truncate">{lead.phone || '-'}</span>
                        </div>
                        {lead.email && (
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[#8a99ad]" title={lead.email}>
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                        {(Number(lead.enquiry_count) || 1) > 1 && (
                          <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                            <EnquiryBadge lead={lead} onClick={() => setEnquiryLead(lead)} />
                          </div>
                        )}
                      </td>

                      {/* Project / Form */}
                      <td className="px-3 py-3">
                        <LeadProjectChips lead={lead} autoCaptured label={false} />
                        <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[11px] text-[#5a6a82]" title={lead.formId && lead.formId !== '-' ? `Form ID: ${lead.formId}` : undefined}>
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{lead.formName !== '-' ? lead.formName : 'Direct Inquiry'}</span>
                        </div>
                      </td>

                      {/* Message (wide screens) */}
                      <td className="hidden xl:table-cell px-3 py-3">
                        <div className="line-clamp-3 break-words text-xs leading-relaxed text-[#334155]" title={lead.messageText}>
                          {lead.messageText}
                        </div>
                      </td>

                      {/* Status + Follow up */}
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 flex-col items-start gap-1.5">
                          {renderStatusSelect(lead)}
                          <FollowUpButton lead={lead} canEdit={canChangeStatus} onClick={() => setFollowUpLead(lead)} />
                        </div>
                      </td>

                      {/* Actions: SMS, Email, WhatsApp, Details */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canMessage && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setComposer({ leads: [lead], channel: 'sms' }); }}
                              disabled={!lead.phone} title={lead.phone ? 'Send SMS' : 'No phone number'} aria-label="Send SMS"
                              className={`${iconBtn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white hover:border-sky-600`}>
                              <Smartphone className="h-4 w-4" />
                            </button>
                          )}
                          {canMessage && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setComposer({ leads: [lead], channel: 'email' }); }}
                              disabled={!lead.email} title={lead.email ? `Send email to ${lead.email}` : 'No email address'} aria-label="Send email"
                              className={`${iconBtn} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600`}>
                              <Mail className="h-4 w-4" />
                            </button>
                          )}
                          <button type="button" onClick={(e) => handleOpenWhatsAppChat(e, lead)}
                            title={wa.isValid ? `Chat on WhatsApp (${wa.formattedDisplay})` : (wa.errorReason === 'missing' ? 'No phone number for WhatsApp' : 'Invalid phone number for WhatsApp')}
                            aria-label="Chat on WhatsApp"
                            className={`${iconBtn} ${wa.isValid ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-[#25D366] hover:text-white hover:border-[#25D366]' : 'border-gray-200 bg-gray-50 text-gray-400 opacity-60 cursor-not-allowed'}`}>
                            <WhatsAppIcon className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => handleOpenLead(lead)} title="View form details" aria-label="View form details"
                            className={`${iconBtn} group border-[#d0e1fd] bg-[#eef4ff] text-[#2563eb] hover:bg-[#1e3a5f] hover:text-white hover:border-[#1e3a5f]`}>
                            <MessageSquareText className="h-4 w-4" />
                            {isUnread && (
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white shadow-xs"></span>
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[#5a6a82]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Inbox className="h-8 w-8 text-[#8a99ad]" />
                        <span className="font-medium text-sm">No inbox messages found.</span>
                        <p className="text-xs text-[#8a99ad]">Incoming leads and inquiries will appear here automatically.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden flex flex-col divide-y divide-[#e8ecf2]">
            {processedLeads.length > 0 ? (
              processedLeads.map((lead) => {
                const isMobileUnread = (lead.status === 'new' || !lead.status) && !viewedLeadIds.has(lead.id);
                return (
                <div 
                  key={`mobile-lead-${lead.id}`} 
                  onClick={() => handleOpenLead(lead)}
                  className="p-4 flex flex-col gap-3 hover:bg-[#f8fafc] transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#5a6a82] bg-[#f1f4f8] px-2 py-0.5 rounded">
                          #{(currentPage - 1) * pageSize + processedLeads.indexOf(lead) + 1}
                        </span>
                        <div className="font-semibold text-[#0f1d33] text-base">{lead.name || 'Anonymous Lead'}</div>
                        {isMobileUnread && (
                          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                        )}
                      </div>
                      {(Number(lead.enquiry_count) || 1) > 1 && (
                        <div className="mt-1.5">
                          <EnquiryBadge lead={lead} size="md" onClick={() => setEnquiryLead(lead)} />
                        </div>
                      )}
                      <div className="text-xs text-[#5a6a82] mt-1 flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-[#8a99ad]" />
                        {lead.phone || '-'}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {renderStatusSelect(lead)}
                        <FollowUpButton lead={lead} canEdit={canChangeStatus} size="md" onClick={() => setFollowUpLead(lead)} />
                      </div>
                      {lead.email && (
                        <div className="text-xs text-[#8a99ad] mt-0.5 flex items-center gap-1.5 truncate">
                          <Mail className="h-3 w-3 text-[#8a99ad]" />
                          {lead.email}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Project & Form Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-[11px] font-medium text-[#8a99ad] block mb-0.5">Project</span>
                      <LeadProjectChips lead={lead} autoCaptured label={false} />
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-[#8a99ad] block mb-0.5">Form ID & Name</span>
                      <div className="truncate">
                        <span className="font-semibold text-[#0f1d33] block truncate">{lead.formName || '-'}</span>
                        {lead.formId && lead.formId !== '-' && (
                          <span className="text-[10px] font-mono text-[#5a6a82] bg-[#eef2f6] px-1 rounded">
                            ID: {lead.formId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Message */}
                  <div className="bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf2] mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a99ad] block mb-1">Message</span>
                    <p className="text-xs text-[#334155] leading-relaxed line-clamp-3">
                      {lead.messageText}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#e8ecf2]">
                    {/* SMS (MSG91) */}
                    {canMessage && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (lead.phone) setComposer({ leads: [lead], channel: 'sms' }); }}
                        disabled={!lead.phone}
                        className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 hover:border-sky-600 transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                        title={lead.phone ? 'Send SMS' : 'No phone number for SMS'}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>SMS</span>
                      </button>
                    )}
                    {canMessage && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (lead.email) setComposer({ leads: [lead], channel: 'email' }); }}
                        disabled={!lead.email}
                        className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                        title={lead.email ? `Send email to ${lead.email}` : 'No email address'}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>Email</span>
                      </button>
                    )}

                    {/* WhatsApp Direct Chat Button */}
                    {(() => {
                      const wa = resolveWhatsAppLink(lead.phone, lead.name, lead.project || lead.property_interest);
                      return (
                        <button
                          type="button"
                          onClick={(e) => handleOpenWhatsAppChat(e, lead)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs ${
                            wa.isValid
                              ? 'bg-emerald-50 hover:bg-[#25D366] text-emerald-700 hover:text-white border border-emerald-300 hover:border-[#25D366]'
                              : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                          }`}
                          title={wa.isValid ? `Chat with ${wa.formattedDisplay}` : 'No phone number for WhatsApp'}
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      );
                    })()}

                    {/* View Details Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenLead(lead);
                      }}
                      className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#eef4ff] hover:bg-[#1e3a5f] text-[#1e3a5f] hover:text-white border border-[#d0e1fd] hover:border-[#1e3a5f] transition-all shadow-2xs group cursor-pointer text-xs font-semibold"
                      title="View form details"
                      aria-label="View form details"
                    >
                      <MessageSquareText className="h-3.5 w-3.5 text-[#2563eb] group-hover:text-white transition-colors" />
                      <span>View Details</span>
                      {isMobileUnread && (
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse ml-0.5" />
                      )}
                    </button>
                  </div>
                </div>
              )})
            ) : (
              <div className="p-8 text-center text-[#5a6a82]">
                <Inbox className="h-8 w-8 text-[#8a99ad] mx-auto mb-2" />
                <span className="font-medium text-sm">No inbox messages found.</span>
              </div>
            )}
          </div>

          {/* Pagination UI */}
          {totalLeadsCount > pageSize && (
            <div className="flex items-center justify-between border-t border-[#e8ecf2] bg-white px-4 py-3 sm:px-6 mt-auto shrink-0">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || isPageLoading}
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage * pageSize >= totalLeadsCount || isPageLoading}
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, totalLeadsCount)}</span> of{' '}
                    <span className="font-medium">{totalLeadsCount}</span> results
                    {isPageLoading && <span className="ml-2 text-[#0f1d33] font-medium">Loading...</span>}
                  </p>
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
      </div>

      {/* Dynamic Form Details Modal */}
      {formDetailsLead && (() => {
        const data = extractDynamicFormResponses(formDetailsLead, availableForms);
        if (!data) return null;

        const handleCopyAll = () => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(data.copyText);
            setCopiedFeedback(true);
            setTimeout(() => setCopiedFeedback(false), 2000);
          }
        };

        const handleCopyPhone = () => {
          if (data.contact.phone && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(data.contact.phone);
          }
        };

        const waResult = resolveWhatsAppLink(data.contact.phone, data.contact.name, data.contact.project);
        const waUrl = waResult.isValid ? waResult.url : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-[#0f1d33]/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
              onClick={() => setFormDetailsLead(null)} 
            />

            {/* Modal Dialog */}
            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#e8ecf2] flex flex-col max-h-[90vh] overflow-hidden transform-gpu animate-in zoom-in-95 duration-200 z-10">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between p-5 sm:p-6 border-b border-[#e8ecf2] bg-gradient-to-r from-[#f8fafc] via-[#f1f5f9] to-[#eef4ff]">
                <div className="flex items-start gap-3.5">
                  <div className="bg-[#1e3a5f] p-2.5 rounded-xl text-white shadow-xs shrink-0 mt-0.5">
                    <MessageSquareText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-[#0f1d33]">
                        Form Submission Details
                      </h2>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        data.isMeta 
                          ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                          : data.isWhatsApp 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {data.sourceType}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#5a6a82] mt-1">
                      <span className="font-semibold text-[#1e3a5f]">{data.formName}</span>
                      {data.formId && (
                        <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-[#e2e8f0] text-[#334155]">
                          ID: {data.formId}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8a99ad] mt-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>Submitted on {data.submittedAt}</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setFormDetailsLead(null)}
                  className="p-1.5 text-[#5a6a82] hover:text-[#0f1d33] hover:bg-white rounded-lg transition-colors border border-transparent hover:border-[#e8ecf2]"
                  aria-label="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-[#f8fafc] space-y-4">
                
                {/* Contact Identity Card */}
                <div className="bg-white p-4 rounded-xl border border-[#e8ecf2] shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#f1f4f8]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] font-bold text-sm flex items-center justify-center">
                        {(data.contact.name || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[#0f1d33]">{data.contact.name}</div>
                        <span className="text-[10px] font-semibold text-[#8a99ad] uppercase tracking-wider">
                          Status: <span className="text-[#0f1d33] font-bold">{(data.contact.status || 'new').toUpperCase()}</span>
                        </span>
                      </div>
                    </div>

                    {data.contact.project && data.contact.project !== '-' && (
                      <div className="inline-flex items-center gap-1.5 bg-[#f8fafc] px-2.5 py-1 rounded-lg border border-[#e8ecf2] text-xs font-semibold text-[#0f1d33]">
                        <Building className="w-3.5 h-3.5 text-[#5a6a82]" />
                        <span>{data.contact.project}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    {/* Phone */}
                    <div className="flex items-center justify-between bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf2]">
                      <div className="flex items-center gap-2 text-xs truncate">
                        <Phone className="w-3.5 h-3.5 text-[#8a99ad] shrink-0" />
                        <span className="font-semibold text-[#0f1d33]">{data.contact.phone || 'No phone provided'}</span>
                      </div>
                      {data.contact.phone && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={handleCopyPhone}
                            className="p-1 text-[#5a6a82] hover:text-[#0f1d33] hover:bg-white rounded transition-colors"
                            title="Copy Phone Number"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Email */}
                    <div className="flex items-center justify-between bg-[#f8fafc] p-2.5 rounded-lg border border-[#e8ecf2]">
                      <div className="flex items-center gap-2 text-xs truncate">
                        <Mail className="w-3.5 h-3.5 text-[#8a99ad] shrink-0" />
                        <span className="font-semibold text-[#0f1d33] truncate" title={data.contact.email}>
                          {data.contact.email || 'No email provided'}
                        </span>
                      </div>
                      {data.contact.email && (
                        <button
                          onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                              navigator.clipboard.writeText(data.contact.email);
                            }
                          }}
                          className="p-1 text-[#5a6a82] hover:text-[#0f1d33] hover:bg-white rounded transition-colors shrink-0 ml-2"
                          title="Copy Email"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dynamic Form Responses Header */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#2563eb]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e3a5f]">
                      Information Filled in Form ({data.fields.length} {data.fields.length === 1 ? 'Field' : 'Fields'})
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#8a99ad]">Dynamic Form Data</span>
                </div>

                {/* Form Responses Cards Grid */}
                {data.fields.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.fields.map((field, idx) => {
                      const isFullWidth = field.value.length > 50 || field.highlight || field.category === 'action';
                      return (
                        <div
                          key={`resp-${idx}`}
                          className={`bg-white p-3.5 rounded-xl border transition-all ${
                            field.highlight
                              ? 'border-blue-200 bg-blue-50/40 sm:col-span-2'
                              : isFullWidth
                                ? 'border-[#e8ecf2] sm:col-span-2'
                                : 'border-[#e8ecf2]'
                          } shadow-xs hover:border-[#1e3a5f]/30`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82] block mb-1">
                            {field.label}
                          </span>
                          <p className="text-xs sm:text-sm font-semibold text-[#0f1d33] leading-relaxed whitespace-pre-wrap break-words">
                            {field.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-dashed border-[#d0d7e2] p-6 text-center">
                    <FileText className="w-8 h-8 text-[#8a99ad] mx-auto mb-2" />
                    <h4 className="text-xs font-bold text-[#0f1d33]">Standard Form Submission</h4>
                    <p className="text-xs text-[#5a6a82] mt-1 max-w-sm mx-auto">
                      The user submitted primary contact details without additional custom questionnaire fields.
                    </p>
                  </div>
                )}

                {/* Activity & Message History Log */}
                {formDetailsLead.lead_activities && formDetailsLead.lead_activities.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Clock className="w-4 h-4 text-[#5a6a82]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e3a5f]">
                        Activity & Interaction Log ({formDetailsLead.lead_activities.length})
                      </h3>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {formDetailsLead.lead_activities.map((act: any, idx: number) => {
                        const time = new Date(act.created_at).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        });
                        const isIncoming = (act.activity_type || '').toLowerCase().includes('incoming whatsapp');

                        return (
                          <div
                            key={`act-${idx}`}
                            className={`p-3 rounded-xl border text-xs ${
                              isIncoming
                                ? 'bg-emerald-50/70 border-emerald-200'
                                : 'bg-white border-[#e8ecf2]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                isIncoming ? 'text-emerald-800' : 'text-[#1e3a5f]'
                              }`}>
                                {activityLabel(act.activity_type)}
                              </span>
                              <span className="text-[10px] text-[#8a99ad]">{time}</span>
                            </div>
                            <p className="text-xs text-[#334155] whitespace-pre-wrap leading-relaxed">
                              {act.description || act.details || act.notes || 'Activity recorded'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-[#e8ecf2] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  onClick={handleCopyAll}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1e3a5f] bg-[#f1f5f9] hover:bg-[#e2e8f0] transition-colors border border-[#cbd5e1]"
                >
                  {copiedFeedback ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Copied All Responses!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All Responses</span>
                    </>
                  )}
                </button>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <FollowUpButton lead={formDetailsLead} canEdit={canChangeStatus} size="md" onClick={() => setFollowUpLead(formDetailsLead)} />
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                      <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                    </a>
                  )}

                  <button
                    onClick={() => setFormDetailsLead(null)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold bg-[#0f1d33] hover:bg-[#1e3a5f] text-white transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  )
}
