'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { readTheme, saveTheme } from '@/lib/theme'

/** Light / dark switch for the CRM (REQ-107). `compact` = icon only. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    setTheme(readTheme())
    const on = (e: Event) => setTheme((e as CustomEvent).detail === 'dark' ? 'dark' : 'light')
    window.addEventListener('crm:theme', on)
    return () => window.removeEventListener('crm:theme', on)
  }, [])
  const dark = theme === 'dark'
  const toggle = () => saveTheme(dark ? 'light' : 'dark')
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg text-xs font-semibold text-[#5a6a82] hover:bg-[#f3f5f8] hover:text-[#0f1d33] transition-colors cursor-pointer ${compact ? 'w-10 justify-center' : 'w-full px-3'}`}
    >
      {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      {!compact && <span>{dark ? 'Light theme' : 'Dark theme'}</span>}
    </button>
  )
}
