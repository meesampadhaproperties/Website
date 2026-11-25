'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { getCachedAuthSession } from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';
import { BrandSettings } from '@/lib/branding';

const BUCKET_NAME = 'crm-branding';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB strict limit
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

/**
 * Ensures the crm-branding bucket exists with proper 5MB size limit & PNG/JPEG restriction.
 */
async function ensureBrandingBucket(supabaseAdmin: any) {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = (buckets || []).some((b: any) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
    if (!exists) {
      await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: ['image/png', 'image/jpeg'],
      });
    }
  } catch (err) {
    console.warn('Could not auto-create storage bucket:', err);
  }
}

/**
 * Uploads a user's brand logo to Supabase Storage with strict 5MB and PNG/JPEG limits.
 * Enforces the rule: User must remove any existing logo first.
 */
export async function uploadBrandLogoAction(formData: FormData): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  try {
    const session = await getCachedAuthSession();
    if (!session.user) {
      return { success: false, error: 'Unauthorized: Please log in to manage branding.' };
    }
    if (session.role !== 'Super Admin') {
      return { success: false, error: 'Only the Super Admin can upload the company logo.' };
    }

    const userId = session.user.id;
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: 'No image file was selected.' };
    }

    // 1. Strict 5MB size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File size exceeds the 5MB maximum limit (${(file.size / (1024 * 1024)).toFixed(2)} MB uploaded).`,
      };
    }

    // 2. Strict MIME type check (PNG & JPEG ONLY)
    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return {
        success: false,
        error: 'Only PNG and JPEG formats are allowed. SVG, WebP, and other formats are strictly prohibited.',
      };
    }

    const supabaseAdmin = createServiceClient();

    // 3. "Remove First to Replace" check
    // Query user's current profile brand_settings to check for an existing logo
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('brand_settings')
      .eq('id', userId)
      .maybeSingle();

    const currentBrandSettings = (profile?.brand_settings || {}) as BrandSettings;

    if (currentBrandSettings.customLogoUrl) {
      return {
        success: false,
        error: 'An active company logo already exists. You must remove the current logo before uploading a new one.',
      };
    }

    // 4. Ensure bucket is provisioned
    await ensureBrandingBucket(supabaseAdmin);

    // 5. Upload file into user-scoped directory: logos/{userId}/logo.{ext}
    const ext = file.type.toLowerCase().includes('png') ? 'png' : 'jpg';
    const filePath = `logos/${userId}/logo.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      console.error('Supabase storage upload error:', uploadErr);
      return { success: false, error: `Upload failed: ${uploadErr.message}` };
    }

    // 6. Retrieve public CDN URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const finalLogoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    // 7. Persist to profiles table (isolated per user)
    const updatedBrandSettings = {
      ...currentBrandSettings,
      customLogoUrl: finalLogoUrl,
    };

    await supabaseAdmin
      .from('profiles')
      .update({
        brand_settings: updatedBrandSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    revalidatePath('/crm/settings');
    revalidatePath('/crm');

    return {
      success: true,
      url: finalLogoUrl,
    };
  } catch (err: any) {
    console.error('Error in uploadBrandLogoAction:', err);
    return { success: false, error: err.message || 'Failed to upload logo.' };
  }
}

/**
 * Removes the active company logo from Supabase Storage and clears it from the user's profile.
 */
export async function removeBrandLogoAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getCachedAuthSession();
    if (!session.user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }
    if (session.role !== 'Super Admin') {
      return { success: false, error: 'Only the Super Admin can remove the company logo.' };
    }

    const userId = session.user.id;
    const supabaseAdmin = createServiceClient();

    // 1. List and delete files in logos/{userId}/
    const { data: existingFiles } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .list(`logos/${userId}`);

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles.map((f: any) => `logos/${userId}/${f.name}`);
      await supabaseAdmin.storage.from(BUCKET_NAME).remove(filesToDelete);
    }

    // 2. Clear customLogoUrl in profiles table
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('brand_settings')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.brand_settings) {
      const updated = { ...profile.brand_settings };
      delete updated.customLogoUrl;

      await supabaseAdmin
        .from('profiles')
        .update({
          brand_settings: updated,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    revalidatePath('/crm/settings');
    revalidatePath('/crm');

    return { success: true };
  } catch (err: any) {
    console.error('Error in removeBrandLogoAction:', err);
    return { success: false, error: err.message || 'Failed to remove logo.' };
  }
}

/**
 * Saves the user's color palette and theme to the database profiles table.
 */
export async function saveBrandSettingsAction(settings: BrandSettings): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getCachedAuthSession();
    if (!session.user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const userId = session.user.id;
    const supabaseAdmin = createServiceClient();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('brand_settings')
      .eq('id', userId)
      .maybeSingle();

    // customLogoUrl is ignored here: it is only ever set by uploadBrandLogoAction (Super Admin)
    const { customLogoUrl: _ignored, ...colorSettings } = (settings || {}) as BrandSettings;
    const merged = {
      ...(profile?.brand_settings || {}),
      ...colorSettings,
    };

    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        brand_settings: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath('/crm/settings');
    revalidatePath('/crm');

    return { success: true };
  } catch (err: any) {
    console.error('Error in saveBrandSettingsAction:', err);
    return { success: false, error: err.message || 'Failed to save brand settings.' };
  }
}

/**
 * Fetches the user's stored brand settings from their database profile.
 */
export async function getBrandSettingsAction(): Promise<{
  success: boolean;
  settings?: BrandSettings | null;
  canManageLogo?: boolean;
  error?: string;
}> {
  try {
    const session = await getCachedAuthSession();
    if (!session.user) {
      return { success: false, error: 'Unauthorized' };
    }
    const canManageLogo = session.role === 'Super Admin';

    const supabaseAdmin = createServiceClient();
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('brand_settings')
      .eq('id', session.user.id)
      .maybeSingle();

    const stored = (profile?.brand_settings as BrandSettings) || null;
    // Only the Super Admin has a company logo; any older logo on another user's profile is not shown
    const settings = stored && !canManageLogo ? { ...stored, customLogoUrl: undefined } : stored;
    return { success: true, settings, canManageLogo };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
