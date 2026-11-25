import { buildMetaOAuthDialogUrl } from '@/lib/meta-scopes'
import { META_GRAPH_BASE_URL, resolveSiteUrl } from '@/lib/site-config'
/**
 * Meta Graph API Integration Library (Facebook & Instagram Lead Gen)
 * Implements 2-step token exchange for permanent Page Access Tokens (never expires),
 * Webhook subscription, Form auto-discovery, and Lead ingestion.
 */

const META_BASE_URL = META_GRAPH_BASE_URL;

export interface MetaPageAccount {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  followers_count?: number;
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status: string; // 'ACTIVE', 'PAUSED', 'ARCHIVED'
  leads_count?: number;
  created_time?: string;
}

export interface ParsedMetaLead {
  leadId: string;
  formId: string;
  pageId: string;
  createdTime: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  city?: string;
  rawFieldData: Record<string, any>;
}

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

/**
 * Generates official Facebook OAuth Dialog URL
 */
export function getMetaOAuthUrl(stateToken: string, customRedirectUri?: string): string {
  const appId = process.env.META_APP_ID || '';
  const redirectUri = customRedirectUri || `${resolveSiteUrl()}/api/auth/meta/callback`;
  return buildMetaOAuthDialogUrl(appId, redirectUri, stateToken);
}

/**
 * 2-STEP TOKEN EXCHANGE ENGINE:
 * Step 1: Exchange temporary code for short-lived User Token
 * Step 2: Exchange short-lived token for 60-Day Long-Lived User Token
 * Step 3: Fetch managed pages -> Returns PERMANENT Page Access Tokens (expires_at: 0 / Never Expire)
 */
export async function exchangeCodeForPermanentPageTokens(
  code: string,
  redirectUri: string
): Promise<{
  success: boolean;
  userToken?: string;
  pages?: MetaPageAccount[];
  error?: string;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return {
      success: false,
      error: 'Meta App ID or App Secret is not configured in server environment.'
    };
  }

  try {
    // 1. Exchange code for short-lived User Token (~1 hour expiry)
    const tokenUrl = `${META_BASE_URL}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const step1Res = await fetch(tokenUrl);
    const step1Data = await step1Res.json();

    if (step1Data.error) {
      return { success: false, error: step1Data.error.message || 'Failed to exchange authorization code.' };
    }

    const shortLivedToken = step1Data.access_token;

    // 2. Exchange short-lived token for Long-Lived User Token (60 days)
    const longTokenUrl = `${META_BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const step2Res = await fetch(longTokenUrl);
    const step2Data = await step2Res.json();

    if (step2Data.error) {
      return { success: false, error: step2Data.error.message || 'Failed to generate long-lived token.' };
    }

    const longLivedUserToken = step2Data.access_token;

    // Check permissions granted by the user
    try {
      const permsRes = await fetch(`${META_BASE_URL}/me/permissions?access_token=${longLivedUserToken}`);
      const permsData = await permsRes.json();
      console.log('[Meta OAuth] Granted Permissions:', JSON.stringify(permsData));
    } catch (e: any) {
      console.warn('[Meta OAuth] Could not fetch permissions:', e.message);
    }

    // 3. Query /me/accounts using the 60-day token.
    // META SPECIFICATION INVARIANT: Page tokens generated from long-lived user tokens NEVER EXPIRE (expires_at: 0)
    const accountsUrl = `${META_BASE_URL}/me/accounts?fields=id,name,access_token,category,tasks,followers_count&access_token=${longLivedUserToken}`;
    const step3Res = await fetch(accountsUrl);
    const step3Data = await step3Res.json();
    console.log('[Meta OAuth] Accounts response:', JSON.stringify(step3Data));

    let pages: MetaPageAccount[] = step3Data.data || [];

    // Fallback for Meta Business Portfolios: If /me/accounts is empty, query business portfolio assets
    if (pages.length === 0) {
      try {
        console.log('[Meta OAuth] Querying /me/businesses for business-owned pages...');
        const bizUrl = `${META_BASE_URL}/me/businesses?fields=id,name,owned_pages{id,name,access_token,category,tasks,followers_count},client_pages{id,name,access_token,category,tasks,followers_count}&access_token=${longLivedUserToken}`;
        const bizRes = await fetch(bizUrl);
        const bizData = await bizRes.json();
        console.log('[Meta OAuth] Businesses response:', JSON.stringify(bizData));

        if (bizData.data && Array.isArray(bizData.data)) {
          for (const biz of bizData.data) {
            const owned = biz.owned_pages?.data || [];
            const client = biz.client_pages?.data || [];
            for (const p of [...owned, ...client]) {
              if (p.id && !pages.some((existing) => existing.id === p.id)) {
                pages.push(p);
              }
            }
          }
        }
      } catch (bizErr: any) {
        console.warn('[Meta OAuth] Business pages fetch fallback error:', bizErr.message);
      }
    }

    if (step3Data.error && pages.length === 0) {
      return { success: false, error: step3Data.error.message || 'Failed to fetch managed Facebook pages.' };
    }

    return {
      success: true,
      userToken: longLivedUserToken,
      pages
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error communicating with Meta Graph API.'
    };
  }
}

/**
 * Subscribes a Facebook Page to this app's Leadgen Webhook
 */
export async function subscribePageToLeadgenWebhook(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${META_BASE_URL}/${pageId}/subscribed_apps`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['leadgen'],
        access_token: pageAccessToken
      })
    });

    const data = await res.json();
    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: Boolean(data.success) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Discovers and fetches all active Lead Gen Forms on a Facebook Page
 */
export async function fetchPageLeadForms(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean; forms: MetaLeadForm[]; error?: string }> {
  // Sandbox Simulator Support (Allows instant UI testing without real Meta App review)
  if (pageAccessToken.includes('simulated') || pageId.includes('page_') || !process.env.META_APP_ID) {
    return {
      success: true,
      forms: [
        {
          id: 'form_982341092834',
          name: '3BHK Luxury Flats Inquiry Form',
          status: 'ACTIVE',
          leads_count: 24,
          created_time: new Date(Date.now() - 14 * 86400000).toISOString()
        },
        {
          id: 'form_451298374619',
          name: 'Festive Discount & Site Visit Registration',
          status: 'ACTIVE',
          leads_count: 18,
          created_time: new Date(Date.now() - 7 * 86400000).toISOString()
        },
        {
          id: 'form_129847192834',
          name: 'Brochure Download Quick Form',
          status: 'ACTIVE',
          leads_count: 9,
          created_time: new Date(Date.now() - 2 * 86400000).toISOString()
        }
      ]
    };
  }

  try {
    const url = `${META_BASE_URL}/${pageId}/leadgen_forms?fields=id,name,status,leads_count,created_time&access_token=${pageAccessToken}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return { success: false, forms: [], error: data.error.message };
    }

    return { success: true, forms: data.data || [] };
  } catch (err: any) {
    return { success: false, forms: [], error: err.message };
  }
}

/**
 * Normalizes and extracts lead fields from Meta Graph API field_data array.
 * Handles single full_name, separate first_name + last_name, email, city, and
 * cleans phone prefixes (e.g. 'p:+919876543210' -> '+919876543210').
 */
/** A Meta lead form question (from GET /{form_id}?fields=questions) */
export interface MetaFormQuestion {
  key: string;
  label?: string;
  type?: string; // FULL_NAME, FIRST_NAME, LAST_NAME, EMAIL, PHONE, CITY, CUSTOM, ...
  options?: { key: string; value: string }[];
}

/** Standard Meta prefill keys → Meta question type (exact match only, never substring guessing) */
const STANDARD_KEY_TYPES: Record<string, string> = {
  full_name: 'FULL_NAME', fullname: 'FULL_NAME', name: 'FULL_NAME',
  first_name: 'FIRST_NAME', last_name: 'LAST_NAME',
  email: 'EMAIL', phone_number: 'PHONE', phone: 'PHONE', mobile_number: 'PHONE',
  city: 'CITY',
};

/** Contact field types stored in lead columns (not repeated in the answers list) */
export const CONTACT_FIELD_TYPES = new Set(['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE']);

/** Resolves a field's type from the form's question list, else from the exact standard key. */
export function resolveMetaFieldType(key: string, questions?: MetaFormQuestion[]): string {
  const q = questions?.find(qq => qq.key === key);
  if (q?.type) return q.type.toUpperCase();
  return STANDARD_KEY_TYPES[(key || '').toLowerCase().trim()] || 'CUSTOM';
}

export function parseMetaLeadFields(
  fieldData: any[] = [],
  leadId: string,
  formId: string,
  pageId: string = '',
  createdTime: string = new Date().toISOString(),
  defaultName: string = 'Meta Lead Prospect',
  questions?: MetaFormQuestion[]
): ParsedMetaLead {
  // Raw answers exactly as Meta sent them; multi-select answers keep EVERY value
  const rawMap: Record<string, any> = {};
  let fullName = '';
  let firstName = '';
  let lastName = '';
  let email = '';
  let phoneNumber = '';
  let city = '';

  (fieldData || []).forEach((f: any) => {
    const key = String(f.name || '').trim();
    if (!key) return;
    const values: any[] = Array.isArray(f.values) ? f.values : (f.values == null ? [] : [f.values]);
    rawMap[key] = values.length > 1 ? values : (values[0] ?? '');
    const first = String(values[0] ?? '').trim();

    switch (resolveMetaFieldType(key, questions)) {
      case 'FULL_NAME': if (!fullName) fullName = first; break;
      case 'FIRST_NAME': if (!firstName) firstName = first; break;
      case 'LAST_NAME': if (!lastName) lastName = first; break;
      case 'EMAIL': if (!email) email = first; break;
      case 'PHONE': if (!phoneNumber) phoneNumber = first; break;
      case 'CITY': if (!city) city = first; break;
    }
  });

  if (!fullName) fullName = `${firstName} ${lastName}`.trim();

  // Clean phone number: remove 'p:', 'tel:', leading letters or colons
  const cleanPhone = (phoneNumber || '').replace(/^[a-zA-Z:]+/, '').trim();

  return {
    leadId,
    formId,
    pageId,
    createdTime,
    fullName: fullName || defaultName,
    email: email || '',
    phoneNumber: cleanPhone,
    city,
    rawFieldData: rawMap
  };
}

/**
 * Formats raw Meta form question key into a clean, human-readable label
 */
export function formatMetaQuestionKey(rawKey: string): string {
  if (!rawKey) return '';
  const trimmed = rawKey.trim();
  const lower = trimmed.toLowerCase();

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

  let formatted = trimmed.replace(/[_-]+/g, ' ').trim();
  if (formatted.endsWith('?')) {
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  return formatted
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Formats raw Meta form answer value (e.g. cleans up snake_case options)
 */
export function formatMetaAnswerValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.map(formatMetaAnswerValue).filter(Boolean).join(', ');
  const str = String(val).trim();
  if (!str || str === 'null' || str === 'undefined' || str === '(no text content)') return '';
  // Single tokens with no spaces are option keys / short values: "2_bhk" → "2 Bhk", "₹30–50_lakhs" → "₹30–50 Lakhs",
  // "business" → "Business". Free text (has spaces), emails and URLs are returned exactly as typed.
  if (!/\s/.test(str) && !str.includes('@') && !str.includes('://')) {
    return str.split('_').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return str;
}

/** One answered question, labelled with the form's real question text when available. */
export interface LabeledMetaAnswer {
  key: string;
  question: string;
  answer: string;
}

/**
 * Builds the answers list shown to users: real question labels + real option labels
 * (from the form's question list), falling back to formatted keys/values.
 * Contact fields (name/email/phone) are excluded since they live on the lead itself.
 */
export function buildLabeledAnswers(rawFieldData: Record<string, any>, questions?: MetaFormQuestion[]): LabeledMetaAnswer[] {
  if (!rawFieldData || typeof rawFieldData !== 'object') return [];
  const out: LabeledMetaAnswer[] = [];
  for (const [key, raw] of Object.entries(rawFieldData)) {
    if (key.startsWith('_')) continue;
    if (CONTACT_FIELD_TYPES.has(resolveMetaFieldType(key, questions))) continue;
    const q = questions?.find(qq => qq.key === key);
    const values = (Array.isArray(raw) ? raw : [raw]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (values.length === 0) continue;
    const answer = values
      .map(v => q?.options?.find(o => o.key === String(v))?.value || formatMetaAnswerValue(v))
      .filter(Boolean)
      .join(', ');
    if (!answer) continue;
    out.push({ key, question: (q?.label || '').trim() || formatMetaQuestionKey(key), answer });
  }
  return out;
}

/**
 * Formats custom questionnaire fields into a clean multiline string for lead.message
 */
export function formatMetaCustomFields(rawFieldData: Record<string, any>, questions?: MetaFormQuestion[]): string {
  return buildLabeledAnswers(rawFieldData, questions).map(a => `${a.question}: ${a.answer}`).join('\n');
}

const questionCache = new Map<string, { at: number; questions: MetaFormQuestion[] }>();
const QUESTION_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Fetches a lead form's questions (real labels, types, option labels). Cached for 10 minutes.
 * Returns [] in sandbox mode or on error: callers then fall back to key-based formatting.
 */
export async function fetchFormQuestions(formId: string, pageAccessToken: string): Promise<MetaFormQuestion[]> {
  if (!formId || !pageAccessToken || pageAccessToken.includes('simulated') || formId.includes('form_') || !process.env.META_APP_ID) return [];
  const cached = questionCache.get(formId);
  if (cached && Date.now() - cached.at < QUESTION_CACHE_TTL_MS) return cached.questions;
  try {
    const res = await fetch(`${META_BASE_URL}/${encodeURIComponent(formId)}?fields=questions&access_token=${encodeURIComponent(pageAccessToken)}`);
    const data = await res.json();
    if (data.error || !Array.isArray(data.questions)) return [];
    const questions: MetaFormQuestion[] = data.questions.map((q: any) => ({
      key: String(q.key || ''),
      label: q.label,
      type: q.type,
      options: Array.isArray(q.options) ? q.options.map((o: any) => ({ key: String(o.key), value: String(o.value) })) : undefined,
    }));
    questionCache.set(formId, { at: Date.now(), questions });
    return questions;
  } catch {
    return [];
  }
}

/**
 * Live check: is our Meta app subscribed to this Page's `leadgen` webhook field?
 * Returns subscribed=null when it cannot be determined (sandbox / no credentials / API error).
 */
export async function checkPageLeadgenSubscription(pageId: string, pageAccessToken: string): Promise<{ subscribed: boolean | null; error?: string }> {
  const appId = process.env.META_APP_ID;
  if (!appId || !pageId || !pageAccessToken || pageAccessToken.includes('simulated')) return { subscribed: null, error: 'Sandbox or Meta app not configured' };
  try {
    const res = await fetch(`${META_BASE_URL}/${encodeURIComponent(pageId)}/subscribed_apps?access_token=${encodeURIComponent(pageAccessToken)}`);
    const data = await res.json();
    if (data.error) return { subscribed: null, error: data.error.message };
    const app = (data.data || []).find((a: any) => String(a.id) === String(appId));
    return { subscribed: Boolean(app && (app.subscribed_fields || []).includes('leadgen')) };
  } catch (err: any) {
    return { subscribed: null, error: err.message };
  }
}

/**
 * Fetches single lead data by leadgen_id from Meta Webhook event
 */
export async function fetchLeadData(
  leadgenId: string,
  pageAccessToken: string,
  questions?: MetaFormQuestion[]
): Promise<{ success: boolean; lead?: ParsedMetaLead; error?: string }> {
  try {
    const url = `${META_BASE_URL}/${leadgenId}?access_token=${pageAccessToken}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    const parsed = parseMetaLeadFields(
      data.field_data,
      data.id,
      data.form_id,
      data.page_id,
      data.created_time,
      'Meta Lead Prospect',
      questions
    );

    return { success: true, lead: parsed };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Historical Lead Puller: Fetches past leads from a form (30, 60, 90 days, or All Leads)
 * Supports pagination up to 10 pages (1,000 leads)
 */
export async function fetchHistoricalLeads(
  formId: string,
  pageAccessToken: string,
  limit: number = 100,
  daysBack: number = 30,
  questions?: MetaFormQuestion[]
): Promise<{ success: boolean; leads: ParsedMetaLead[]; error?: string }> {
  const isAllTime = daysBack <= 0;
  const sinceTimestamp = isAllTime ? 0 : Math.floor((Date.now() - daysBack * 86400 * 1000) / 1000);

  // Sandbox Simulator Support: return realistic past leads if in test mode
  if (pageAccessToken.includes('simulated') || formId.includes('form_') || !process.env.META_APP_ID) {
    const mockNames = [
      { name: 'Vikramaditya Verma', phone: '+919876541234', email: 'vikram.verma@example.com', city: 'Bangalore' },
      { name: 'Pooja Kulkarni', phone: '+919845012345', email: 'pooja.kulkarni@example.com', city: 'Mumbai' },
      { name: 'Arjun Nambiar', phone: '+919731298765', email: 'arjun.nambiar@example.com', city: 'Hyderabad' },
      { name: 'Sneha Deshmukh', phone: '+919920182736', email: 'sneha.deshmukh@example.com', city: 'Pune' },
      { name: 'Rohan Singhania', phone: '+919810293847', email: 'rohan.s@example.com', city: 'Delhi NCR' },
      { name: 'Ananya Iyer', phone: '+919820394857', email: 'ananya.iyer@example.com', city: 'Chennai' },
      { name: 'Karthik Rao', phone: '+919844098231', email: 'karthik.rao@example.com', city: 'Mysore' }
    ];

    const stepDays = Math.max(1, Math.floor(Math.max(daysBack, 30) / (mockNames.length + 1)));
    const allMockLeads: ParsedMetaLead[] = mockNames.map((m, i) => {
      const daysAgo = (i + 1) * stepDays;
      const createdDate = new Date(Date.now() - daysAgo * 86400000);
      return {
        leadId: `lead_${Date.now()}_${i}`,
        formId: formId || 'form_982341092834',
        pageId: 'page_simulated',
        createdTime: createdDate.toISOString(),
        fullName: m.name,
        email: m.email,
        phoneNumber: m.phone,
        city: m.city,
        rawFieldData: { full_name: m.name, email: m.email, phone_number: m.phone, city: m.city }
      };
    });

    const leads = isAllTime
      ? allMockLeads
      : allMockLeads.filter(lead => new Date(lead.createdTime).getTime() >= sinceTimestamp * 1000);

    return { success: true, leads };
  }

  try {
    let url = `${META_BASE_URL}/${formId}/leads?fields=id,created_time,field_data,form_id&limit=${Math.min(limit, 100)}&access_token=${pageAccessToken}`;
    
    if (!isAllTime) {
      const filterParam = encodeURIComponent(JSON.stringify([{
        field: 'time_created',
        operator: 'GREATER_THAN',
        value: sinceTimestamp
      }]));
      url += `&filtering=${filterParam}`;
    }

    const allLeads: ParsedMetaLead[] = [];
    let currentUrl: string | null = url;
    let pageCount = 0;
    const MAX_PAGES = 10; // Up to 1,000 historical leads safely

    while (currentUrl && pageCount < MAX_PAGES) {
      pageCount++;
      const res: Response = await fetch(currentUrl);
      const data: any = await res.json();

      if (data.error) {
        if (allLeads.length > 0) {
          // If we already collected some pages, return them safely
          break;
        }
        return { success: false, leads: [], error: data.error.message };
      }

      const parsedBatch: ParsedMetaLead[] = (data.data || []).map((item: any) => {
        return parseMetaLeadFields(
          item.field_data,
          item.id,
          item.form_id || formId,
          '',
          item.created_time,
          'Historical Lead',
          questions
        );
      });

      allLeads.push(...parsedBatch);

      if (data.paging?.next && data.data && data.data.length > 0) {
        currentUrl = data.paging.next;
      } else {
        currentUrl = null;
      }
    }

    return { success: true, leads: allLeads };
  } catch (err: any) {
    return { success: false, leads: [], error: err.message };
  }
}

/**
 * Proactive Diagnostic: Checks if a Page Access Token is valid, active, or revoked
 */
export async function debugMetaAccessToken(
  inputToken: string
): Promise<{
  isValid: boolean;
  appId?: string;
  expiresAt?: number;
  scopes?: string[];
  errorMessage?: string;
  isNeverExpiring?: boolean;
  unverified?: boolean;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    // Cannot verify without app credentials: report as unverified, never as valid
    return {
      isValid: false,
      unverified: true,
      errorMessage: 'Meta App credentials (META_APP_ID / META_APP_SECRET) are not configured, so the token cannot be verified.'
    };
  }

  try {
    const appToken = `${appId}|${appSecret}`;
    const url = `${META_BASE_URL}/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return {
        isValid: false,
        errorMessage: data.error.message
      };
    }

    const info = data.data;
    // Meta reports expires_at = 0 for never-expiring tokens; anything else (incl. missing) is not "never"
    const isNeverExpiring = info.expires_at === 0;

    return {
      isValid: Boolean(info.is_valid),
      appId: info.app_id,
      expiresAt: info.expires_at,
      scopes: info.scopes || [],
      isNeverExpiring,
      errorMessage: info.is_valid ? undefined : (info.error?.message || 'Access token revoked or invalid')
    };
  } catch (err: any) {
    return {
      isValid: false,
      errorMessage: err.message || 'Token verification network failure'
    };
  }
}
