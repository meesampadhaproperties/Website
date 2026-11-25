/**
 * CRM light/dark theme (REQ-107). Per browser (localStorage). Only the CRM (/crm) goes dark;
 * the public website always stays light. Dark colours live in app/globals.css (html.crm-dark).
 */
export const THEME_KEY = 'crm_theme'
export const DARK_CLASS = 'crm-dark'

export function readTheme(): 'light' | 'dark' {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark')
}

export function saveTheme(theme: 'light' | 'dark') {
  try { localStorage.setItem(THEME_KEY, theme) } catch {}
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent('crm:theme', { detail: theme }))
}

/** Runs before first paint on CRM pages, so dark mode doesn't flash white. */
export const THEME_PRELOAD_SCRIPT = `(function(){try{if(location.pathname.indexOf('/crm')===0&&localStorage.getItem('${THEME_KEY}')==='dark'){document.documentElement.classList.add('${DARK_CLASS}')}}catch(e){}})();`
