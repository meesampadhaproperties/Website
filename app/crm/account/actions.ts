'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getCachedAuthSession } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import { validatePasswordPolicy } from '@/lib/auth/password-policy'

/**
 * Any signed-in user changes THEIR OWN password (no module permission needed).
 * - The target is always the caller's own account (never taken from the browser).
 * - The current password must be correct.
 * - The password policy is enforced on the server.
 * Changing OTHER users' passwords is only possible in User Management (Super Admin, changeAdminPassword).
 */
export async function changeOwnPasswordAction(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const session = await getCachedAuthSession()
  const user = session.user
  if (!user?.email) return { success: false, error: 'Please log in again.' }

  if (!currentPassword || !newPassword) return { success: false, error: 'Enter your current and new password.' }
  if (currentPassword === newPassword) return { success: false, error: 'The new password must be different from the current one.' }
  if (!validatePasswordPolicy(newPassword).isValid) {
    return { success: false, error: 'Password does not meet the policy (12-20 characters, 1 uppercase, 1 number, 1 special character).' }
  }

  // Verify the current password with a throwaway client (no cookies, no persisted session)
  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInErr } = await verifier.auth.signInWithPassword({ email: user.email, password: currentPassword })
  if (signInErr) {
    return { success: false, error: signInErr.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'Current password is incorrect.' }
  }
  await verifier.auth.signOut({ scope: 'local' }).catch(() => {})

  const { error } = await createServiceClient().auth.admin.updateUserById(user.id, { password: newPassword })
  if (error) return { success: false, error: error.message }
  return { success: true }
}
