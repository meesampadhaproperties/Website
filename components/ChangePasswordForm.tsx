'use client'

import { useRef, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { PasswordChecklist } from '@/lib/auth/PasswordChecklist'
import { validatePasswordPolicy } from '@/lib/auth/password-policy'
import { changeOwnPasswordAction } from '@/app/crm/account/actions'

const inputCls = 'w-full rounded-xl border border-[#d5dce6] px-3.5 py-2.5 pr-10 text-sm focus:border-[#0f1d33] focus:outline-none focus:ring-1 focus:ring-[#0f1d33]'
const labelCls = 'block text-xs font-bold uppercase tracking-wider text-[#0f1d33] mb-1.5'

function PasswordField({ label, value, onChange, placeholder, autoComplete }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} required value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder={placeholder} autoComplete={autoComplete} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#5a6a82] hover:text-[#0f1d33] cursor-pointer">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

/** Change YOUR OWN password (every signed-in user). Requires the current password. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const valid = validatePasswordPolicy(next).isValid && next === confirm && current.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busyRef.current || !valid) return
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    try {
      const res = await changeOwnPasswordAction(current, next)
      if (!res.success) {
        setMessage({ type: 'error', text: res.error || 'Could not change password.' })
      } else {
        setMessage({ type: 'success', text: 'Password changed. Use the new password next time you log in.' })
        setCurrent(''); setNext(''); setConfirm('')
        onDone?.()
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not change password. Check your connection and try again.' })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {message && (
        <div role="status" className={`p-3 rounded-xl text-xs font-semibold ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {message.text}
        </div>
      )}
      <PasswordField label="Current Password" value={current} onChange={setCurrent} placeholder="Enter your current password" autoComplete="current-password" />
      <div>
        <PasswordField label="New Password" value={next} onChange={setNext} placeholder="12-20 characters" autoComplete="new-password" />
        <PasswordChecklist password={next} confirmPassword={confirm} className="mt-2" />
      </div>
      <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" autoComplete="new-password" />
      <button type="submit" disabled={busy || !valid}
        className="w-full min-h-10 inline-flex items-center justify-center rounded-xl bg-[#0f1d33] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1e3a5f] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Update Password
      </button>
    </form>
  )
}
