'use server'

import { COMPANY_NAME } from '@/lib/site-config'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { issueVerificationCode, consumeVerificationCode } from '@/lib/verification-codes'
import { buildLeadReport, sendReportEmail, sendReportWhatsApp, sendWhatsAppOtp, currentIstSlot, windowForSlot, REPORT_SLOTS, reportFileNames, type ReportFile } from '@/lib/reports/lead-report'
import { buildReportWorkbook } from '@/lib/reports/report-excel'
import { Resend } from 'resend'
import { normalizeWaRecipientPhone } from '@/lib/phone-input'
import { DEFAULT_REPORT_TIMES, masterTimesFor, normalizeReportTimes } from '@/lib/reports/slots'

// ----------------------------------------------------------------------
// REPORT RECIPIENTS ACTIONS
// ----------------------------------------------------------------------

export interface ReportRecipient {
  id: string
  email: string
  name: string | null
  created_at: string
  report_times?: string[] | null
  /** Slots (a subset of report_times) at which the master report (every lead so far) is attached too */
  master_times?: string[] | null
}

/**
 * Strict authorization check: verifies caller's authenticated session and admin role
 */
async function requireAuthenticatedAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('Unauthorized: Valid session required. Please log in.')
  }

  const supabaseAdmin = createServiceClient()
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  // Trusted sources only: user_metadata is self-editable by any signed-in user
  const role = profile?.role || user.app_metadata?.role || ''
  if (role !== 'Super Admin') {
    throw new Error('Forbidden: Only Super Admin can modify system configuration and access control.')
  }

  return { user, role }
}

export async function getReportRecipients(): Promise<{ data: ReportRecipient[], error: string | null }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()

    // Clean up any legacy test recipient that might have been saved
    try {
      await supabase
        .from('report_recipients')
        .delete()
        .or('email.ilike.%bhuwanta%,name.ilike.%master admin%')
    } catch {
      // ignore cleanup errors if column/table is still pending
    }

    const { data, error } = await supabase
      .from('report_recipients')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('report_recipients table might not exist yet:', error)
      return { data: [], error: null }
    }

    return { data: (data || []) as ReportRecipient[], error: null }
  } catch (err: any) {
    console.error('Error fetching report recipients:', err)
    return { data: [], error: null }
  }
}

export async function addReportRecipient(email: string, name?: string | null): Promise<{ success: boolean, data?: ReportRecipient, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('report_recipients')
      .insert([{ 
        email,
        name: name && name.trim() ? name.trim() : null
      }])
      .select()
      .single()

    if (error) throw error
    revalidatePath('/crm/modules')
    return { success: true, data: data as ReportRecipient }
  } catch (err: any) {
    console.error('Error adding report recipient:', err)
    return { success: false, error: err.message || 'Failed to add recipient' }
  }
}

export async function updateReportRecipient(
  id: string,
  updates: { name?: string | null; email?: string; report_times?: string[] | null; master_times?: string[] | null }
): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const payload: Record<string, any> = {}

    if (updates.name !== undefined) {
      payload.name = updates.name && updates.name.trim() ? updates.name.trim() : null
    }

    if (updates.email !== undefined) {
      payload.email = updates.email.trim().toLowerCase()
    }

    if (updates.report_times !== undefined || updates.master_times !== undefined) {
      // The master report can only ride on a slot the person receives: work out both lists together
      const { data: cur } = await supabase.from('report_recipients').select('report_times, master_times').eq('id', id).maybeSingle()
      const times = updates.report_times !== undefined ? normalizeReportTimes(updates.report_times) : normalizeReportTimes(cur?.report_times)
      payload.report_times = times
      payload.master_times = masterTimesFor(times, updates.master_times !== undefined ? updates.master_times : cur?.master_times)
    }

    // Helper: attempt an upsert/update, and if it fails because
    // report_times column doesn't exist yet, retry without it.
    const stripTimingsAndRetry = (err: any, payloadObj: Record<string, any>): Record<string, any> | null => {
      const msg = String(err?.message || err?.code || '')
      if (msg.includes('report_times') && 'report_times' in payloadObj) {
        const { report_times: _dropped, master_times: _m, ...rest } = payloadObj
        return rest
      }
      return null
    }

    // Check if ID is a valid UUID format
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (!isUuid) {
      throw new Error(`Invalid recipient ID format: ${id}`)
    }

    const { data, error } = await supabase
      .from('report_recipients')
      .update(payload)
      .eq('id', id)
      .select()

    if (error) {
      const fallback = stripTimingsAndRetry(error, payload)
      if (fallback && Object.keys(fallback).length > 0) {
        const { data: d2, error: e2 } = await supabase
          .from('report_recipients')
          .update(fallback)
          .eq('id', id)
          .select()
        if (e2) throw e2
        if (!d2 || d2.length === 0) throw new Error('Recipient not found in database')
      } else {
        throw error
      }
    } else if (!data || data.length === 0) {
      throw new Error('Recipient not found in database')
    }

    revalidatePath('/crm/modules')
    return { success: true }
  } catch (err: any) {
    console.error('Error updating report recipient:', err)
    return { success: false, error: err.message || 'Failed to update recipient' }
  }
}

export async function removeReportRecipient(id: string): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (!isUuid) {
      return { success: false, error: 'Invalid recipient ID format.' }
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('report_recipients')
      .delete()
      .eq('id', id)

    if (error) throw error
    revalidatePath('/crm/modules')
    return { success: true }
  } catch (err: any) {
    console.error('Error removing report recipient:', err)
    return { success: false, error: err.message || 'Failed to remove recipient' }
  }
}

/**
 * Sends a real test report through the SAME builder/sender as the scheduled cron.
 * testHour (IST 0-23) → the window is the 3 hours ending at that hour today; otherwise the last 3 hours.
 */
export async function testReportEmail(email: string, testHour?: number, withMaster = false): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const { start, end } = testWindow(testHour)
    const db = createServiceClient()
    const report = await buildLeadReport(db, start, end)
    const names = reportFileNames(report)
    const files: ReportFile[] = [{ filename: names.report, content: await buildReportWorkbook(db, start, end) }]
    if (withMaster) files.push({ filename: names.master, content: await buildReportWorkbook(db, start, end, true) })
    await sendReportEmail(String(email).trim(), report, true, files)
    return { success: true }
  } catch (err: any) {
    console.error('Error sending test report email:', err)
    return { success: false, error: err.message || 'Failed to send test email' }
  }
}

/** The window of the chosen slot (e.g. 9 PM → 6 PM – 9 PM today). Without a slot: the 3 hours up to now. */
function testWindow(testHour?: number): { start: Date; end: Date } {
  const { date } = currentIstSlot()
  if (typeof testHour === 'number') {
    const slot = `${String(testHour).padStart(2, '0')}:00`
    if ((REPORT_SLOTS as readonly string[]).includes(slot)) return windowForSlot(date, slot)
  }
  const end = new Date()
  return { start: new Date(end.getTime() - 3 * 60 * 60 * 1000), end }
}

export async function sendEmailOtp(email: string): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const target = String(email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return { success: false, error: 'Enter a valid email address.' }
    const apiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL
    if (!apiKey || !fromEmail || fromEmail.endsWith('@yourdomain.com')) {
      return { success: false, error: 'Email sending is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).' }
    }
    const otp = await issueVerificationCode(createServiceClient(), 'email', target)
    const companyName = COMPANY_NAME
    const { error } = await new Resend(apiKey).emails.send({
      from: `${companyName} Security <${fromEmail}>`,
      to: target,
      subject: `Your ${companyName} report verification code`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;border:1px solid #e8ecf2;border-radius:12px;overflow:hidden">
          <div style="background:#0f1d33;padding:20px 24px"><h2 style="color:#fff;margin:0;font-size:18px">Email verification</h2></div>
          <div style="padding:24px">
            <p style="color:#5a6a82;font-size:14px;margin-top:0">Use this code to add this email to the automated lead report recipients:</p>
            <div style="background:#f3f5f8;padding:20px;text-align:center;border-radius:8px;border:1px dashed #c4a55a">
              <strong style="font-size:36px;letter-spacing:8px;color:#0f1d33">${otp}</strong>
            </div>
            <p style="color:#8a99ad;font-size:12px;margin-bottom:0">Valid for 10 minutes. If you didn't request this, ignore this email.</p>
          </div>
        </div>`
    })
    if (error) throw new Error(error.message)
    return { success: true }
  } catch (err: any) {
    console.error('Error sending email OTP:', err)
    return { success: false, error: err.message || 'Failed to send OTP email' }
  }
}

export async function verifyAndAddEmail(email: string, otp: string, name?: string | null): Promise<{ success: boolean, data?: ReportRecipient, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const target = String(email || '').trim().toLowerCase()
    const check = await consumeVerificationCode(createServiceClient(), 'email', target, otp)
    if (!check.ok) return { success: false, error: check.error }
    const res = await addReportRecipient(target, name)
    if (!res.success) throw new Error(res.error)
    return { success: true, data: res.data }
  } catch (err: any) {
    console.error('Error verifying email OTP:', err)
    return { success: false, error: err.message || 'Verification failed' }
  }
}

// ----------------------------------------------------------------------
// WHATSAPP RECIPIENTS ACTIONS
// ----------------------------------------------------------------------

export interface WaRecipient {
  id: string
  phone_number: string
  name: string | null
  created_at: string
  report_times?: string[] | null
  master_times?: string[] | null
}

/** The table's column is `phone`; the screens use `phone_number`. */
const toWaRecipient = (r: any): WaRecipient => ({ ...r, phone_number: r.phone })

export async function getWaRecipients(): Promise<{ data: WaRecipient[], error: string | null }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('whatsapp_report_recipients')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('whatsapp_report_recipients table might not exist yet:', error)
      return { data: [], error: null }
    }

    return { data: (data || []).map(toWaRecipient), error: null }
  } catch (err: any) {
    console.error('Error fetching WA recipients:', err)
    return { data: [], error: null }
  }
}

export async function addWaRecipient(
  phone_number: string, 
  name?: string | null,
  report_times?: string[] | null,
  master_times?: string[] | null
): Promise<{ success: boolean, data?: WaRecipient, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    
    // 1. Normalize and validate phone
    const clean = normalizeWaRecipientPhone(phone_number)
    if (!clean.valid) {
      return { success: false, error: clean.error || 'Invalid phone number format' }
    }

    // 2. Check for duplicate phone number
    const { data: existing } = await supabase
      .from('whatsapp_report_recipients')
      .select('id, name, phone')
      .eq('phone', clean.phone)
      .maybeSingle()

    if (existing) {
      return { 
        success: false, 
        error: `Phone number +${clean.phone} is already registered${existing.name ? ` for ${existing.name}` : ''}.` 
      }
    }

    // 3. Ensure report_times defaults to all active slots
    const timesToSave = normalizeReportTimes(report_times).length ? normalizeReportTimes(report_times) : DEFAULT_REPORT_TIMES

    const { data, error } = await supabase
      .from('whatsapp_report_recipients')
      .insert([{ 
        phone: clean.phone,
        name: name && name.trim() ? name.trim() : null,
        report_times: timesToSave,
        master_times: masterTimesFor(timesToSave, master_times),
      }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505' || String(error.message).includes('unique constraint')) {
        return { success: false, error: 'This phone number is already registered as a WhatsApp recipient.' }
      }
      throw error
    }

    revalidatePath('/crm/modules')
    return { success: true, data: toWaRecipient(data) }
  } catch (err: any) {
    console.error('Error adding WA recipient:', err)
    return { success: false, error: err.message || 'Failed to add WhatsApp number' }
  }
}

export async function updateWaRecipient(
  id: string, 
  updates: { name?: string | null; phone_number?: string; report_times?: string[] | null; master_times?: string[] | null }
): Promise<{ success: boolean, data?: WaRecipient, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()

    // 1. Verify recipient exists
    const { data: current, error: fetchErr } = await supabase
      .from('whatsapp_report_recipients')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr || !current) {
      return { 
        success: false, 
        error: 'Recipient not found in database. The recipient may have been removed on another device. Please refresh.' 
      }
    }

    const payload: Record<string, any> = {}

    if (updates.name !== undefined) {
      payload.name = updates.name && updates.name.trim() ? updates.name.trim() : null
    }

    if (updates.phone_number !== undefined) {
      const clean = normalizeWaRecipientPhone(updates.phone_number)
      if (!clean.valid) {
        return { success: false, error: clean.error || 'Invalid phone number format' }
      }

      // If phone changed, ensure no collision with another recipient
      if (clean.phone !== current.phone) {
        const { data: duplicate } = await supabase
          .from('whatsapp_report_recipients')
          .select('id, name')
          .eq('phone', clean.phone)
          .neq('id', id)
          .maybeSingle()

        if (duplicate) {
          return { 
            success: false, 
            error: `Phone number +${clean.phone} is already used by another recipient${duplicate.name ? ` (${duplicate.name})` : ''}.` 
          }
        }
      }

      payload.phone = clean.phone
    }

    if (updates.report_times !== undefined || updates.master_times !== undefined) {
      const times = updates.report_times !== undefined ? normalizeReportTimes(updates.report_times) : normalizeReportTimes(current.report_times)
      payload.report_times = times
      payload.master_times = masterTimesFor(times, updates.master_times !== undefined ? updates.master_times : current.master_times)
    }

    const { data, error } = await supabase
      .from('whatsapp_report_recipients')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // Fallback if report_times column issue
      const msg = String(error?.message || '')
      if (msg.includes('report_times') && 'report_times' in payload) {
        const { report_times: _dropped, master_times: _m, ...fallback } = payload
        if (Object.keys(fallback).length > 0) {
          const { data: d2, error: e2 } = await supabase
            .from('whatsapp_report_recipients')
            .update(fallback)
            .eq('id', id)
            .select()
            .single()
          if (e2) throw e2
          revalidatePath('/crm/modules')
          return { success: true, data: toWaRecipient(d2) }
        }
      }
      if (error.code === '23505' || String(error.message).includes('unique constraint')) {
        return { success: false, error: 'This phone number is already registered by another recipient.' }
      }
      throw error
    }

    revalidatePath('/crm/modules')
    return { success: true, data: toWaRecipient(data) }
  } catch (err: any) {
    console.error('Error updating WA recipient:', err)
    return { success: false, error: err.message || 'Failed to update WhatsApp recipient' }
  }
}

export async function updateWaRecipientName(id: string, name: string): Promise<{ success: boolean, error?: string }> {
  return updateWaRecipient(id, { name })
}

export async function removeWaRecipient(id: string): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (!isUuid) {
      return { success: false, error: 'Invalid recipient ID format.' }
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('whatsapp_report_recipients')
      .delete()
      .eq('id', id)

    if (error) throw error
    revalidatePath('/crm/modules')
    return { success: true }
  } catch (err: any) {
    console.error('Error removing WA recipient:', err)
    return { success: false, error: err.message || 'Failed to remove WhatsApp number' }
  }
}

export async function sendWaOtp(phone: string): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const normalized = normalizeWaRecipientPhone(phone)
    if (!normalized.valid) return { success: false, error: normalized.error || 'Invalid phone number.' }
    const otp = await issueVerificationCode(createServiceClient(), 'whatsapp', normalized.phone)
    // Business-initiated WhatsApp messages require an APPROVED authentication template
    await sendWhatsAppOtp(normalized.phone, otp)
    return { success: true }
  } catch (err: any) {
    console.error('Error sending WhatsApp OTP:', err)
    return { success: false, error: err.message || 'Failed to send WhatsApp code' }
  }
}

export async function verifyAndAddWa(phone: string, otp: string): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const normalized = normalizeWaRecipientPhone(phone)
    if (!normalized.valid) return { success: false, error: normalized.error || 'Invalid phone number.' }
    const check = await consumeVerificationCode(createServiceClient(), 'whatsapp', normalized.phone, otp)
    if (!check.ok) return { success: false, error: check.error }
    const res = await addWaRecipient(normalized.phone)
    if (!res.success) throw new Error(res.error)
    return { success: true }
  } catch (err: any) {
    console.error('Error verifying WA OTP:', err)
    return { success: false, error: err.message || 'Verification failed' }
  }
}

export async function testReportWa(phone: string, testHour?: number, withMaster = false): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const normalized = normalizeWaRecipientPhone(phone)
    if (!normalized.valid) return { success: false, error: normalized.error || 'Invalid phone number.' }
    const { start, end } = testWindow(testHour)
    const report = await buildLeadReport(createServiceClient(), start, end)
    await sendReportWhatsApp(normalized.phone, report, withMaster)
    return { success: true }
  } catch (err: any) {
    console.error('Error testing report WA:', err)
    return { success: false, error: err.message || 'Failed to send test WhatsApp message' }
  }
}

// ----------------------------------------------------------------------
// ACCESS CONTROL ACTIONS
// ----------------------------------------------------------------------

import { getEffectivePermissions as getEffectivePerms, checkActionAccess } from '@/lib/auth/permissions'
import { isReservedStatusKey } from '@/lib/lead-status'

export type AccessLevel = 'none' | 'view' | 'edit'

export interface RolePermission {
  id?: string
  role_id: string
  module_name: string
  access_level: AccessLevel
}

export interface UserPermission {
  id?: string
  user_id: string
  module_name: string
  access_level: AccessLevel
}

export async function getRolePermissions(roleId: string): Promise<{ data: RolePermission[], error: string | null }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role_id', roleId)

    if (error) return { data: [], error: error.message }
    return { data: data as RolePermission[], error: null }
  } catch (err: any) {
    return { data: [], error: err.message }
  }
}

export async function updateRolePermissions(roleId: string, permissions: { module_name: string, access_level: AccessLevel }[]): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    // Enforce non-delegable security invariant: modules and users can never be granted to roles
    const safePermissions = permissions.filter(p => p.module_name !== 'modules' && p.module_name !== 'users')
    
    // Upsert permissions
    if (safePermissions.length === 0) {
      // If none, maybe they cleared all? Let's delete all.
      await supabase.from('role_permissions').delete().eq('role_id', roleId)
    } else {
      const payload = safePermissions.map(p => ({
        role_id: roleId,
        module_name: p.module_name,
        access_level: p.access_level
      }))
      
      const { error } = await supabase
        .from('role_permissions')
        .upsert(payload, { onConflict: 'role_id,module_name' })

      if (error) throw error
      
      // Also delete any removed permissions
      const keptModules = safePermissions.map(p => p.module_name)
      await supabase.from('role_permissions').delete().eq('role_id', roleId).not('module_name', 'in', `(${keptModules.map(m => `"${m}"`).join(',')})`)
    }

    revalidatePath('/crm/modules')
    return { success: true }
  } catch (err: any) {
    console.error(err)
    return { success: false, error: err.message }
  }
}

export async function getUserPermissions(userId: string): Promise<{ data: UserPermission[], error: string | null }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId)

    if (error) return { data: [], error: error.message }
    return { data: data as UserPermission[], error: null }
  } catch (err: any) {
    return { data: [], error: err.message }
  }
}

export async function updateUserPermissions(userId: string, permissions: { module_name: string, access_level: AccessLevel }[]): Promise<{ success: boolean, error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    
    // Clear all existing overrides first
    const { error: deleteError } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      
    if (deleteError) throw deleteError

    // Insert new ones if any (enforce non-delegable security invariant)
    const safeUserPermissions = permissions.filter(p => p.module_name !== 'modules' && p.module_name !== 'users')
    if (safeUserPermissions.length > 0) {
      const payload = safeUserPermissions.map(p => ({
        user_id: userId,
        module_name: p.module_name,
        access_level: p.access_level
      }))
      const { error } = await supabase.from('user_permissions').insert(payload)
      if (error) throw error
    }

    revalidatePath('/crm/modules')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getEffectivePermissionsClient(): Promise<Record<string, AccessLevel>> {
  return await getEffectivePerms()
}

// ============================================================
// LEAD STATUSES MODULE
// ============================================================

export interface LeadStatus {
  id: string
  name: string
  key: string
  color_bg: string
  color_text: string
  color_border?: string
  description?: string | null
  sort_order: number
  is_system: boolean
  is_default: boolean
  leads_count?: number
  created_at?: string
  updated_at?: string
}

export async function getLeadStatuses(): Promise<{ success: boolean; data: LeadStatus[]; error?: string }> {
  try {
    const readAuth = await checkActionAccess('leads', 'view')
    if (!readAuth.authorized) throw new Error(readAuth.error)
    if (!isSupabaseConfigured()) {
      return { success: true, data: [] };
    }

    const supabase = createServiceClient()
    
    // Fetch all statuses
    const { data: statuses, error } = await supabase
      .from('lead_statuses')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    // Fetch counts from leads table
    const { data: leadRows, error: leadsError } = await supabase
      .from('leads')
      .select('status')

    const countMap: Record<string, number> = {}
    if (!leadsError && leadRows) {
      for (const row of leadRows) {
        const sKey = (row.status || 'new').toLowerCase().trim()
        countMap[sKey] = (countMap[sKey] || 0) + 1
      }
    }

    const enrichedStatuses = (statuses || []).map((s: any) => ({
      ...s,
      leads_count: countMap[s.key.toLowerCase()] || 0
    }))

    return { success: true, data: enrichedStatuses }
  } catch (err: any) {
    console.error('Error fetching lead statuses:', err)
    return { success: false, data: [], error: err.message || 'Failed to fetch lead statuses' }
  }
}

export async function createLeadStatus(payload: {
  name: string
  key?: string
  color_bg?: string
  color_text?: string
  color_border?: string
  description?: string
  sort_order?: number
}): Promise<{ success: boolean; data?: LeadStatus; error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const trimmedName = (payload.name || '').trim()
    if (!trimmedName) {
      return { success: false, error: 'Status name is required.' }
    }

    // Auto-generate key from name if not provided
    const key = (payload.key || trimmedName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (!key) {
      return { success: false, error: 'Invalid status identifier slug.' }
    }
    if (isReservedStatusKey(key)) {
      return { success: false, error: 'Follow ups are scheduled with the Follow up button on each lead, so "Follow Up" can\'t be a status.' }
    }

    // Check duplicate key or name
    const { data: existing } = await supabase
      .from('lead_statuses')
      .select('id, name, key')
      .or(`key.eq.${key},name.ilike.${trimmedName}`)
      .maybeSingle()

    if (existing) {
      return { success: false, error: `A status with name "${trimmedName}" or key "${key}" already exists.` }
    }

    const { data, error } = await supabase
      .from('lead_statuses')
      .insert({
        name: trimmedName,
        key,
        color_bg: payload.color_bg || 'bg-blue-50',
        color_text: payload.color_text || 'text-blue-700',
        color_border: payload.color_border || 'border-blue-200',
        description: payload.description || null,
        sort_order: typeof payload.sort_order === 'number' ? payload.sort_order : 50,
        is_system: false,
        is_default: false
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/crm/modules')
    revalidatePath('/crm/leads')
    revalidatePath('/crm')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error creating lead status:', err)
    return { success: false, error: err.message || 'Failed to create lead status.' }
  }
}

export async function updateLeadStatus(
  id: string,
  updates: {
    name?: string
    color_bg?: string
    color_text?: string
    color_border?: string
    description?: string
    sort_order?: number
  }
): Promise<{ success: boolean; data?: LeadStatus; error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) return { success: false, error: 'Status name cannot be empty.' }
      updatePayload.name = trimmed
    }
    if (updates.color_bg !== undefined) updatePayload.color_bg = updates.color_bg
    if (updates.color_text !== undefined) updatePayload.color_text = updates.color_text
    if (updates.color_border !== undefined) updatePayload.color_border = updates.color_border
    if (updates.description !== undefined) updatePayload.description = updates.description
    if (updates.sort_order !== undefined) updatePayload.sort_order = updates.sort_order

    const { data, error } = await supabase
      .from('lead_statuses')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/crm/modules')
    revalidatePath('/crm/leads')
    revalidatePath('/crm')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error updating lead status:', err)
    return { success: false, error: err.message || 'Failed to update lead status.' }
  }
}

export async function getLeadStatusUsage(statusKey: string): Promise<{ count: number }> {
  try {
    const readAuth = await checkActionAccess('leads', 'view')
    if (!readAuth.authorized) throw new Error(readAuth.error)
    const supabase = createServiceClient()
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', statusKey)

    if (error) throw error
    return { count: count || 0 }
  } catch (err) {
    console.error('Error checking status usage:', err)
    return { count: 0 }
  }
}

export async function deleteLeadStatus(
  id: string,
  reassignToKey?: string
): Promise<{ success: boolean; remappedCount?: number; error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()

    // 1. Fetch the target status to verify protection and get key
    const { data: targetStatus, error: fetchErr } = await supabase
      .from('lead_statuses')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !targetStatus) {
      return { success: false, error: 'Status not found.' }
    }

    // 2. Safeguard: Prevent deleting protected system statuses (e.g., 'new')
    if (targetStatus.is_system) {
      return {
        success: false,
        error: `"${targetStatus.name}" is a protected system default status and cannot be deleted.`
      }
    }

    // 3. Check if any leads currently use this status
    const { count: leadsUsingStatus } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', targetStatus.key)

    const usageCount = leadsUsingStatus || 0

    // 4. If leads are currently assigned and NO reassign target is provided, block with instruction
    if (usageCount > 0 && !reassignToKey) {
      return {
        success: false,
        remappedCount: usageCount,
        error: `IN_USE: This status is currently assigned to ${usageCount} active lead(s). Please choose a fallback status to reassign them.`
      }
    }

    // 5. Reassign existing leads if reassignToKey is provided
    if (usageCount > 0 && reassignToKey) {
      if (reassignToKey === targetStatus.key) {
        return { success: false, error: 'Cannot reassign leads to the status being deleted.' }
      }

      const { error: reassignErr } = await supabase
        .from('leads')
        .update({ status: reassignToKey, updated_at: new Date().toISOString() })
        .eq('status', targetStatus.key)

      if (reassignErr) throw reassignErr
    }

    // 6. Delete the status row
    const { error: deleteErr } = await supabase
      .from('lead_statuses')
      .delete()
      .eq('id', id)

    if (deleteErr) throw deleteErr

    revalidatePath('/crm/modules')
    revalidatePath('/crm/leads')
    revalidatePath('/crm')
    return { success: true, remappedCount: usageCount }
  } catch (err: any) {
    console.error('Error deleting lead status:', err)
    return { success: false, error: err.message || 'Failed to delete lead status.' }
  }
}

// ----------------------------------------------------------------------
// LEAD SOURCES ACTIONS
// ----------------------------------------------------------------------

export interface LeadSource {
  id: string
  name: string
  key: string
  sort_order: number
  is_system: boolean
  is_default: boolean
  created_at?: string
  updated_at?: string
}

const DEFAULT_LEAD_SOURCES: LeadSource[] = [
  { id: 'src-meta', name: 'Meta', key: 'meta', sort_order: 1, is_system: true, is_default: true },
  { id: 'src-website', name: 'Website', key: 'website', sort_order: 2, is_system: true, is_default: false },
  { id: 'src-whatsapp', name: 'WhatsApp', key: 'whatsapp', sort_order: 3, is_system: true, is_default: false },
]

export async function getLeadSources(): Promise<{ success: boolean; data: LeadSource[]; error?: string }> {
  try {
    const readAuth = await checkActionAccess('leads', 'view')
    if (!readAuth.authorized) throw new Error(readAuth.error)
    if (!isSupabaseConfigured()) {
      return { success: true, data: DEFAULT_LEAD_SOURCES }
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('lead_sources')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.warn('lead_sources table query notice:', error.message)
      return { success: true, data: DEFAULT_LEAD_SOURCES }
    }

    if (!data || data.length === 0) {
      return { success: true, data: DEFAULT_LEAD_SOURCES }
    }

    return { success: true, data: data as LeadSource[] }
  } catch (err: any) {
    console.error('Error fetching lead sources:', err)
    return { success: true, data: DEFAULT_LEAD_SOURCES }
  }
}

export async function createLeadSource(payload: {
  name: string
  key?: string
  sort_order?: number
}): Promise<{ success: boolean; data?: LeadSource; error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const trimmedName = (payload.name || '').trim()
    if (!trimmedName) {
      return { success: false, error: 'Source name is required.' }
    }

    // Auto-generate key slug from name
    const key = (payload.key || trimmedName)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    if (!key) {
      return { success: false, error: 'Valid source identifier key could not be generated.' }
    }

    // Check if key already exists
    const { data: existing } = await supabase
      .from('lead_sources')
      .select('id, name')
      .eq('key', key)
      .maybeSingle()

    if (existing) {
      return { success: false, error: `A source with key "${key}" already exists (${existing.name}).` }
    }

    const sortOrder = payload.sort_order !== undefined && !isNaN(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : 50

    const { data, error } = await supabase
      .from('lead_sources')
      .insert({
        name: trimmedName,
        key,
        sort_order: sortOrder,
        is_system: false,
        is_default: false
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath('/crm/modules')
    revalidatePath('/crm/leads')
    revalidatePath('/crm')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error creating lead source:', err)
    return { success: false, error: err.message || 'Failed to create lead source.' }
  }
}

export async function updateLeadSource(
  id: string,
  updates: {
    name?: string
    sort_order?: number
  }
): Promise<{ success: boolean; data?: LeadSource; error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) return { success: false, error: 'Source name cannot be empty.' }
      updatePayload.name = trimmed
    }
    if (updates.sort_order !== undefined) updatePayload.sort_order = updates.sort_order

    const { data, error } = await supabase
      .from('lead_sources')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/crm/modules')
    revalidatePath('/crm/leads')
    revalidatePath('/crm')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error updating lead source:', err)
    return { success: false, error: err.message || 'Failed to update lead source.' }
  }
}

export async function deleteLeadSource(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuthenticatedAdmin()
    const supabase = createServiceClient()

    // 1. Fetch source to verify protection
    const { data: targetSource, error: fetchErr } = await supabase
      .from('lead_sources')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !targetSource) {
      return { success: false, error: 'Source not found.' }
    }

    // 2. Safeguard: Prevent deleting protected system sources (Meta, Website, WhatsApp)
    if (targetSource.is_system) {
      return {
        success: false,
        error: `"${targetSource.name}" is a protected system default source and cannot be deleted.`
      }
    }

    // 3. Delete source row
    const { error: deleteErr } = await supabase
      .from('lead_sources')
      .delete()
      .eq('id', id)

    if (deleteErr) throw deleteErr

    revalidatePath('/crm/modules')
    revalidatePath('/crm/leads')
    revalidatePath('/crm')
    return { success: true }
  } catch (err: any) {
    console.error('Error deleting lead source:', err)
    return { success: false, error: err.message || 'Failed to delete lead source.' }
  }
}

