/** Sidebar company name limit (REQ-104), including spaces. */
export const COMPANY_NAME_MAX = 15

/** Browser cache key so the sidebar shows the name instantly on load. */
export const COMPANY_NAME_CACHE_KEY = 'crm_company_name'

/** Event the Settings page fires after saving, so the sidebar updates immediately. */
export const COMPANY_NAME_EVENT = 'crm:company_name'
