import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export type AccessLevel = 'none' | 'view' | 'edit';

const ALL_MODULES = [
  'dashboard',
  'leads',
  'meta',
  'projects',
  'inbox',
  'whatsapp',
  'bulk_sender',
  'reports',
  'modules',
  'users',
  'settings'
];

export interface AuthSessionInfo {
  user: any;
  role: string;
  permissions: Record<string, AccessLevel>;
}

const noAccess = (): Record<string, AccessLevel> =>
  ALL_MODULES.reduce((acc, mod) => ({ ...acc, [mod]: 'none' as AccessLevel }), {} as Record<string, AccessLevel>);

interface RawAccess {
  role: string | null;
  role_exists: boolean;
  role_permissions: { module_name: string; access_level: AccessLevel }[];
  user_permissions: { module_name: string; access_level: AccessLevel }[];
}

/**
 * ONE database round trip (public.crm_user_access, service_role only) returning the user's
 * trusted role + role permissions + user overrides. Previously 4 sequential queries (~1s from Sydney).
 *
 * Role sources are TRUSTED only: profiles.role, else auth app_metadata.role.
 * NEVER user_metadata: any signed-in user can rewrite it via supabase.auth.updateUser().
 */
async function fetchRawAccess(userId: string, appMetadataRole?: string | null): Promise<RawAccess> {
  const { data, error } = await createServiceClient().rpc('crm_user_access', {
    p_user_id: userId,
    p_fallback_role: appMetadataRole || null,
  });
  if (error || !data) throw new Error(error?.message || 'Access lookup failed');
  return data as RawAccess;
}

/**
 * Pure permission rules (unchanged semantics):
 * 1. Super Admin → 'edit' everywhere.
 * 2. Otherwise start at 'none'; apply the role's permissions; an unconfigured 'Admin' role falls back to 'edit'.
 * 3. User-specific overrides win.
 * 4. inbox ↔ whatsapp alias.
 * 5. HARD GATE: 'modules' and 'users' are non-delegable (Super Admin only).
 * No/unknown role → zero access (fail closed).
 */
export function computePermissions(raw: Pick<RawAccess, 'role' | 'role_exists' | 'role_permissions' | 'user_permissions'>): { role: string; permissions: Record<string, AccessLevel> } {
  const role = (raw.role || '').trim();
  const isSuperAdmin = role === 'Super Admin';
  const permissions = noAccess();

  if (isSuperAdmin) {
    ALL_MODULES.forEach((mod) => { permissions[mod] = 'edit'; });
    return { role, permissions };
  }
  if (!role) return { role, permissions };

  if (raw.role_exists) {
    (raw.role_permissions || []).forEach((rp) => { permissions[rp.module_name] = rp.access_level; });
  } else if (role === 'Admin') {
    ALL_MODULES.forEach((mod) => { permissions[mod] = 'edit'; });
  }

  (raw.user_permissions || []).forEach((up) => { permissions[up.module_name] = up.access_level; });

  if (permissions['whatsapp'] && permissions['whatsapp'] !== 'none' && (!permissions['inbox'] || permissions['inbox'] === 'none')) {
    permissions['inbox'] = permissions['whatsapp'];
  } else if (permissions['inbox'] && permissions['inbox'] !== 'none' && (!permissions['whatsapp'] || permissions['whatsapp'] === 'none')) {
    permissions['whatsapp'] = permissions['inbox'];
  }

  permissions['modules'] = 'none';
  permissions['users'] = 'none';
  return { role, permissions };
}

/**
 * Request-scoped cached session (React cache()): layout, page and server actions within ONE request share it.
 * Cost: 1 Supabase Auth call (getUser verifies the JWT server-side) + 1 DB call.
 */
export const getCachedAuthSession = cache(async (): Promise<AuthSessionInfo> => {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { user: null, role: '', permissions: noAccess() };

    const raw = await fetchRawAccess(user.id, user.app_metadata?.role);
    const { role, permissions } = computePermissions(raw);
    return { user, role, permissions };
  } catch (err) {
    console.error('Error fetching cached auth session:', err);
    // Fail closed
    return { user: null, role: '', permissions: noAccess() };
  }
});

/**
 * Effective permissions for the current user, or (for admin tooling) another user.
 */
export async function getEffectivePermissions(targetUserId?: string): Promise<Record<string, AccessLevel>> {
  const session = await getCachedAuthSession();

  if (targetUserId && targetUserId !== session.user?.id) {
    try {
      // Only the profiles role is used for other users (their app_metadata is not loaded here)
      const raw = await fetchRawAccess(targetUserId, null);
      return computePermissions(raw).permissions;
    } catch (err) {
      console.error('Error determining effective permissions for target user:', err);
      return noAccess(); // Fail closed
    }
  }

  return session.permissions;
}

/**
 * Server-side guard to enforce permission checks before rendering CRM pages.
 * Redirects to /crm/login if not logged in, or /crm/unauthorized if permission denied.
 * Returns the cached user, verified role, and accessLevel for immediate zero-latency reuse.
 */
export async function requireAccess(moduleName: string): Promise<{ user: any; role: string; accessLevel: AccessLevel }> {
  const session = await getCachedAuthSession();

  if (!session.user) {
    redirect('/crm/login');
  }

  // HARD SECURITY GATE: 'modules' and 'users' are strictly restricted to Super Admin only
  if ((moduleName === 'modules' || moduleName === 'users') && session.role !== 'Super Admin') {
    redirect('/crm/unauthorized');
  }

  let userAccess = session.permissions[moduleName];
  if (!userAccess || userAccess === 'none') {
    if (moduleName === 'inbox') userAccess = session.permissions['whatsapp'];
    else if (moduleName === 'whatsapp') userAccess = session.permissions['inbox'];
  }
  userAccess = userAccess || 'none';

  if (userAccess === 'none') {
    redirect('/crm/unauthorized');
  }

  return { user: session.user, role: session.role, accessLevel: userAccess };
}

export type ActionAuthResult =
  | { authorized: true; user: any; role: string; accessLevel: AccessLevel; error: null }
  | { authorized: false; user: null; role: string; accessLevel: AccessLevel; error: string };

/**
 * Authorization guard for SERVER ACTIONS and route handlers.
 *
 * Server actions are public POST endpoints: page-level requireAccess() does NOT protect them.
 * Every exported action must call this first. Unlike requireAccess(), it never redirects;
 * it returns a result so each action can respond in its own return shape.
 *
 * - required 'view': caller needs 'view' or 'edit' on the module
 * - required 'edit': caller needs 'edit' on the module
 */
export async function checkActionAccess(
  moduleName: string,
  required: 'view' | 'edit'
): Promise<ActionAuthResult> {
  const session = await getCachedAuthSession();

  if (!session.user) {
    return { authorized: false, user: null, role: '', accessLevel: 'none', error: 'Unauthorized: Valid session required. Please log in.' };
  }

  if ((moduleName === 'modules' || moduleName === 'users') && session.role !== 'Super Admin') {
    return { authorized: false, user: null, role: session.role, accessLevel: 'none', error: 'Forbidden: Super Admin access required.' };
  }

  let level: AccessLevel = session.permissions[moduleName] || 'none';
  if (level === 'none') {
    if (moduleName === 'inbox') level = session.permissions['whatsapp'] || 'none';
    else if (moduleName === 'whatsapp') level = session.permissions['inbox'] || 'none';
  }

  const allowed = required === 'view' ? level === 'view' || level === 'edit' : level === 'edit';
  if (!allowed) {
    return {
      authorized: false,
      user: null,
      role: session.role,
      accessLevel: level,
      error: `Forbidden: ${required === 'edit' ? 'Edit' : 'View'} access to ${moduleName} is required.`
    };
  }

  return { authorized: true, user: session.user, role: session.role, accessLevel: level, error: null };
}
