'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Palette,
  Upload,
  RotateCcw,
  Save,
  CheckCircle2,
  Trash2,
  Search,
  Eye,
  X,
  Loader2,
  Lock,
  ZoomIn,
  ZoomOut,
  Move,
  Crop,
  Sliders,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BrandSettings,
  DEFAULT_BRAND_SETTINGS,
  getStoredBrandSettings,
  saveStoredBrandSettings,
  setAccentVariables,
  hslToHex,
  hexToHsl,
  parseColorSearch,
} from '@/lib/branding';
import {
  uploadBrandLogoAction,
  removeBrandLogoAction,
  saveBrandSettingsAction,
  getBrandSettingsAction,
} from '../actions';

const WHEEL_SIZE = 200;
const RADIUS = WHEEL_SIZE / 2;

export default function BrandingSettings() {
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [currentHex, setCurrentHex] = useState('#c4a55a');
  const [canManageLogo, setCanManageLogo] = useState(false);
  const [hsl, setHsl] = useState({ h: 42, s: 50, l: 56 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isDraggingWheel, setIsDraggingWheel] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);

  // Circular logo cropper & alignment state
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropImgElement, setCropImgElement] = useState<HTMLImageElement | null>(null);
  const [cropNaturalSize, setCropNaturalSize] = useState({ width: 0, height: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [panStartPos, setPanStartPos] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize from storage and synchronize with Supabase profiles table
  useEffect(() => {
    const stored = getStoredBrandSettings();
    setSettings(stored);
    const initialHex = stored.customAccent || '#c4a55a';
    setCurrentHex(initialHex);
    setHsl(hexToHsl(initialHex));

    // Fetch latest user brand settings from Supabase
    async function syncRemoteBrandSettings() {
      try {
        const res = await getBrandSettingsAction();
        if (res.success) setCanManageLogo(!!res.canManageLogo);
        if (res.success && res.settings) {
          const merged = { ...stored, ...res.settings, customLogoUrl: res.canManageLogo ? res.settings.customLogoUrl : undefined };
          setSettings(merged);
          saveStoredBrandSettings(merged);
          if (merged.customAccent) {
            setCurrentHex(merged.customAccent);
            setHsl(hexToHsl(merged.customAccent));
          }
        }
      } catch (err) {
        console.warn('Could not sync remote brand settings:', err);
      }
    }
    syncRemoteBrandSettings();
  }, []);

  // Draw the RGB circular color wheel on canvas
  const drawColorWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imgData = ctx.createImageData(WHEEL_SIZE, WHEEL_SIZE);
    const data = imgData.data;

    for (let y = 0; y < WHEEL_SIZE; y++) {
      for (let x = 0; x < WHEEL_SIZE; x++) {
        const dx = x - RADIUS;
        const dy = y - RADIUS;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * WHEEL_SIZE + x) * 4;

        if (dist <= RADIUS - 2) {
          // Angle in degrees 0..360
          const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          const sat = Math.min(1, dist / (RADIUS - 2));
          const light = hsl.l / 100;

          // HSL to RGB
          const c = (1 - Math.abs(2 * light - 1)) * sat;
          const hPrime = angle / 60;
          const xVal = c * (1 - Math.abs((hPrime % 2) - 1));
          let r1 = 0, g1 = 0, b1 = 0;

          if (hPrime >= 0 && hPrime < 1) { r1 = c; g1 = xVal; }
          else if (hPrime >= 1 && hPrime < 2) { r1 = xVal; g1 = c; }
          else if (hPrime >= 2 && hPrime < 3) { g1 = c; b1 = xVal; }
          else if (hPrime >= 3 && hPrime < 4) { g1 = xVal; b1 = c; }
          else if (hPrime >= 4 && hPrime < 5) { r1 = xVal; b1 = c; }
          else { r1 = c; b1 = xVal; }

          const m = light - c / 2;
          data[idx] = Math.round((r1 + m) * 255);
          data[idx + 1] = Math.round((g1 + m) * 255);
          data[idx + 2] = Math.round((b1 + m) * 255);
          const alpha = dist > RADIUS - 4 ? Math.round((1 - (dist - (RADIUS - 4)) / 2) * 255) : 255;
          data[idx + 3] = alpha;
        } else {
          data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [hsl.l]);

  useEffect(() => {
    drawColorWheel();
  }, [drawColorWheel]);

  // Handle color selection on the wheel
  const handleWheelPick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - RADIUS;
    const y = clientY - rect.top - RADIUS;
    const dist = Math.min(RADIUS - 2, Math.sqrt(x * x + y * y));
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const sat = Math.round((dist / (RADIUS - 2)) * 100);

    const newHsl = { h: Math.round(angle), s: sat, l: hsl.l };
    setHsl(newHsl);
    const hex = hslToHex(newHsl.h, newHsl.s, newHsl.l);
    setCurrentHex(hex);
    applyColor(hex);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDraggingWheel(true);
    handleWheelPick(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingWheel) return;
    handleWheelPick(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    setIsDraggingWheel(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleWheelPick(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const getCursorPos = () => {
    const angleRad = (hsl.h * Math.PI) / 180;
    const dist = (hsl.s / 100) * (RADIUS - 2);
    return {
      x: RADIUS + dist * Math.cos(angleRad),
      y: RADIUS + dist * Math.sin(angleRad),
    };
  };

  const cursorPos = getCursorPos();

  const applyColor = (hex: string) => {
    setSettings((prev) => ({
      ...prev,
      customAccent: hex,
    }));
    setAccentVariables(hex);
    setIsSaved(false);
  };

  // Search color handler
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    const matched = parseColorSearch(searchQuery);
    if (matched) {
      setCurrentHex(matched.hex);
      const newHsl = hexToHsl(matched.hex);
      setHsl(newHsl);
      applyColor(matched.hex);
      toast.success(`Applied ${matched.label} (${matched.hex})`);
    } else {
      toast.error(`Color "${searchQuery}" not recognized. Try a name (gold, blue, ruby) or hex (#ff5500).`);
    }
  };

  const handleLightnessChange = (newL: number) => {
    const updatedHsl = { ...hsl, l: newL };
    setHsl(updatedHsl);
    const hex = hslToHex(updatedHsl.h, updatedHsl.s, newL);
    setCurrentHex(hex);
    applyColor(hex);
  };

  // Helper: Downscale & compress uploaded logo to ensure instant loading & safe localStorage storage
  const compressLogoImage = (file: File, maxDim = 480): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(format, 0.9);
          resolve(dataUrl);
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Logo file selection handler: Validates file and launches interactive Circle Format Adjuster
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. "Remove First" enforcement check
    if (settings.customLogoUrl) {
      toast.error('An active company logo already exists. You must remove the current logo before uploading a new one.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. Strict PNG & JPEG format check (SVG, WebP, GIF strictly rejected)
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      toast.error('Invalid format: Only PNG and JPEG images are allowed (SVG, WebP, GIF, etc. are not accepted).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 3. Strict 5MB file size limit check
    const MAX_SIZE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`File size exceeds 5MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select an image under 5MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Read and open Circular Logo Adjuster modal
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        setCropImageSrc(dataUrl);
        setCropImgElement(img);
        setCropNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setCropZoom(1);
        setCropPan({ x: 0, y: 0 });
        setShowCropModal(true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Drag / Pan handlers for circular viewport
  const handleCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingCrop(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setPanStartPos({ ...cropPan });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCrop) return;
    e.preventDefault();
    const dx = e.clientX - dragStartPos.x;
    const dy = e.clientY - dragStartPos.y;
    setCropPan({
      x: panStartPos.x + dx,
      y: panStartPos.y + dy,
    });
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingCrop) {
      setIsDraggingCrop(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Alignment shortcuts
  const handleFitToCircle = () => {
    setCropZoom(1);
    setCropPan({ x: 0, y: 0 });
  };

  const handleFillCircle = () => {
    if (cropNaturalSize.width && cropNaturalSize.height) {
      const minDim = Math.min(cropNaturalSize.width, cropNaturalSize.height);
      const maxDim = Math.max(cropNaturalSize.width, cropNaturalSize.height);
      const fillRatio = maxDim / minDim;
      setCropZoom(Math.min(3, Math.max(1.15, fillRatio)));
    } else {
      setCropZoom(1.4);
    }
    setCropPan({ x: 0, y: 0 });
  };

  const handleCenterAlign = () => {
    setCropPan({ x: 0, y: 0 });
  };

  // Render high-res circular canvas crop and upload
  const handleApplyCropAndUpload = async () => {
    if (!cropImgElement || !cropImageSrc) return;

    setIsUploadingLogo(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 1. Clip canvas to perfect circular format
      ctx.beginPath();
      ctx.arc(256, 256, 256, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // 2. Transformation math (Viewport is 240px circle, canvas is 512px)
      const VIEWPORT_SIZE = 240;
      const CANVAS_SIZE = 512;
      const scaleRatio = CANVAS_SIZE / VIEWPORT_SIZE;

      const fitScale = Math.min(
        VIEWPORT_SIZE / cropImgElement.naturalWidth,
        VIEWPORT_SIZE / cropImgElement.naturalHeight
      );
      const totalScale = fitScale * cropZoom * scaleRatio;

      ctx.translate(
        256 + cropPan.x * scaleRatio,
        256 + cropPan.y * scaleRatio
      );
      ctx.scale(totalScale, totalScale);

      ctx.drawImage(
        cropImgElement,
        -cropImgElement.naturalWidth / 2,
        -cropImgElement.naturalHeight / 2
      );

      // 4. Export as transparent circular PNG blob
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95)
      );

      if (!blob) throw new Error('Failed to generate cropped image');

      const croppedFile = new File([blob], 'company-logo-circle.png', {
        type: 'image/png',
      });

      const formData = new FormData();
      formData.append('file', croppedFile);

      const res = await uploadBrandLogoAction(formData);

      if (!res.success || !res.url) {
        toast.error(res.error || 'Failed to upload logo to Supabase storage.');
      } else {
        const updated = {
          ...settings,
          customLogoUrl: res.url,
        };
        setSettings(updated);
        saveStoredBrandSettings(updated);
        setIsSaved(true);
        setShowCropModal(false);
        toast.success('Company logo cropped, aligned, and saved in circle format!');
        setTimeout(() => setIsSaved(false), 3000);
      }
    } catch (err: any) {
      toast.error('Failed to process logo: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    setIsRemovingLogo(true);
    try {
      const res = await removeBrandLogoAction();
      if (!res.success) {
        toast.error(res.error || 'Failed to remove logo from Supabase storage.');
      } else {
        const next = { ...settings };
        delete next.customLogoUrl;
        setSettings(next);
        saveStoredBrandSettings(next);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsSaved(true);
        toast.success('Logo removed from Supabase Storage. You can now upload a new logo.');
        setTimeout(() => setIsSaved(false), 3000);
      }
    } catch (err: any) {
      toast.error('Failed to remove logo: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRemovingLogo(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      const res = await saveBrandSettingsAction(settings);
      if (!res?.success) {
        toast.error(res?.error || 'Could not save branding. Please try again.');
        return;
      }
    } catch {
      toast.error('Could not save branding. Check your connection and try again.');
      return;
    }
    saveStoredBrandSettings(settings);
    setIsSaved(true);
    toast.success('Branding saved. It now applies on every device you sign in on.');
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleResetDefaults = async () => {
    if (canManageLogo && settings.customLogoUrl) {
      await removeBrandLogoAction();
    }
    setSettings(DEFAULT_BRAND_SETTINGS);
    setCurrentHex('#c4a55a');
    setHsl(hexToHsl('#c4a55a'));
    saveStoredBrandSettings(DEFAULT_BRAND_SETTINGS);
    try {
      await saveBrandSettingsAction(DEFAULT_BRAND_SETTINGS);
    } catch (err) {
      console.warn('Failed to reset in database:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsSaved(true);
    toast.info('Reset branding to default theme');
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf2] p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#f1f4f8]">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: currentHex }}
            >
              <Palette size={18} />
            </div>
            <h2 className="text-xl font-bold text-[#0f1d33]">Branding & Appearance</h2>
          </div>
          <p className="text-xs text-[#5a6a80] mt-1">
            {canManageLogo ? "Customize your company logo and choose your RGB color palette." : "Choose your RGB color palette."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#5a6a80] hover:text-[#0f1d33] bg-[#f8fafc] hover:bg-[#edf2f7] rounded-lg border border-[#e2e8f0] transition-colors"
          >
            <RotateCcw size={13} />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl shadow-sm transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: currentHex }}
          >
            {isSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {isSaved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* SECTION 1: COMPANY LOGO (Super Admin only; other users can't upload their own) */}
      {canManageLogo && (
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-[#f8fafc] border border-[#e8ecf2] rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold text-[#0f1d33] whitespace-nowrap">Company Logo</h3>
            {settings.customLogoUrl ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                <CheckCircle2 size={12} /> Active Logo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                Default Real Estate Emblem
              </span>
            )}
            <span className="text-xs text-[#5a6a80]">
              {settings.customLogoUrl
                ? 'To upload a new company logo, you must first remove the current active logo.'
                : 'Accepts PNG and JPEG only. Max file size: 5MB (stored securely in Supabase Storage).'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoUpload}
              disabled={Boolean(settings.customLogoUrl) || isUploadingLogo || isRemovingLogo}
              className="hidden"
            />

            {/* If no custom logo: Show Upload Button */}
            {!settings.customLogoUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingLogo}
                title="Upload PNG or JPEG logo (Max 5MB)"
                className="px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg shadow-xs hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                style={{ backgroundColor: currentHex }}
              >
                {isUploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {isUploadingLogo ? 'Uploading to Supabase...' : 'Upload Logo'}
              </button>
            ) : (
              /* If custom logo exists: Show Locked Button + Remove Button */
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={true}
                  title="Remove current logo first before uploading a new one"
                  className="px-3 py-1.5 text-xs font-semibold text-[#8c9ba5] bg-[#edf2f7] border border-[#d5dce6] rounded-lg flex items-center gap-1.5 cursor-not-allowed opacity-80"
                >
                  <Lock size={13} />
                  <span>Upload Locked</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={isRemovingLogo}
                  title="Remove company logo from Supabase Storage"
                  className="px-3 py-1.5 text-xs font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isRemovingLogo ? <Loader2 size={13} className="animate-spin text-red-600" /> : <Trash2 size={13} />}
                  <span>{isRemovingLogo ? 'Removing...' : 'Remove Logo'}</span>
                </button>
              </div>
            )}

            {/* Preview Button */}
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              title="Preview logo across light and dark backgrounds"
              className="px-3 py-1.5 text-xs font-semibold text-[#0f1d33] hover:text-black bg-white hover:bg-[#edf2f7] border border-[#d5dce6] rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Eye size={14} />
              Preview
            </button>
          </div>
        </div>
      </div>
      )}

      {/* SECTION 2: CHOOSE YOUR COLOR PALETTE (RGB WHEEL + COLOR SEARCH BAR, NO QUICK PICKS) */}
      <div className="space-y-4 pt-3 border-t border-[#f1f4f8]">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0f1d33] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentHex }} />
            Choose Your Color Palette
          </h3>
          <p className="text-xs text-[#5a6a80] mt-0.5">
            Select a color using the interactive RGB circle with your mouse, or enter your color code below.
          </p>
        </div>

        {/* Color Code Input Bar */}
        <div>
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-3.5 text-[#8c9ba5]" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                const match = parseColorSearch(e.target.value);
                if (match) {
                  setCurrentHex(match.hex);
                  setHsl(hexToHsl(match.hex));
                  applyColor(match.hex);
                }
              }}
              placeholder="Enter your color code here (e.g. #C4A55A, gold, rgb(196, 165, 90))..."
              className="w-full pl-10 pr-24 py-2 text-sm bg-[#f8fafc] border border-[#d5dce6] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f1d33] transition-all"
            />
            <button
              type="submit"
              className="absolute right-2 px-3 py-1 text-xs font-semibold text-white rounded-lg shadow-sm"
              style={{ backgroundColor: currentHex }}
            >
              Apply
            </button>
          </form>
        </div>

        {/* RGB Circle & Interactive Sliders Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#f8fafc] border border-[#e8ecf2] rounded-2xl p-5">
          {/* Column 1: Interactive RGB Circle */}
          <div className="flex flex-col items-center justify-center select-none">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a80] mb-3">
              Interactive RGB Color Circle
            </span>

            <div
              className="relative cursor-crosshair rounded-full shadow-md p-1 bg-white border border-[#e2e8f0]"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchMove={handleTouchMove}
            >
              <canvas
                ref={canvasRef}
                width={WHEEL_SIZE}
                height={WHEEL_SIZE}
                className="rounded-full block"
              />

              {/* Glowing Pointer Cursor */}
              <div
                className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform"
                style={{
                  left: cursorPos.x + 4,
                  top: cursorPos.y + 4,
                  backgroundColor: currentHex,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.4)',
                }}
              />
            </div>
            <p className="text-[11px] text-[#5a6a80] mt-3 whitespace-nowrap text-center">
              Click or drag inside the circle to choose any color.
            </p>
          </div>

          {/* Column 2: Brightness Slider, Active Hex & Values */}
          <div className="flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a80]">
                Lightness & Tone
              </span>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#5a6a80]">
                  <span>Dark</span>
                  <span className="font-mono font-semibold text-[#0f1d33]">{hsl.l}%</span>
                  <span>Bright</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="85"
                  value={hsl.l}
                  onChange={(e) => handleLightnessChange(Number(e.target.value))}
                  className="w-full h-2.5 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-black via-current to-white"
                  style={{
                    color: hslToHex(hsl.h, hsl.s, 50),
                  }}
                />
              </div>
            </div>

            {/* Active Color Preview & Code Display */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-12 h-12 rounded-xl shadow-inner border border-black/10 shrink-0"
                  style={{ backgroundColor: currentHex }}
                />
                <div>
                  <div className="text-xs text-[#5a6a80] uppercase font-bold tracking-wider">
                    Selected Accent Color
                  </div>
                  <div className="text-xl font-mono font-extrabold text-[#0f1d33] uppercase">
                    {currentHex}
                  </div>
                </div>
              </div>
            </div>

            {/* Live UI Test Badges */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a80]">
                Live Preview Across CRM Elements
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm"
                  style={{ backgroundColor: currentHex }}
                >
                  Primary Button
                </button>
                <div
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border"
                  style={{
                    backgroundColor: `${currentHex}15`,
                    color: currentHex,
                    borderColor: `${currentHex}40`,
                  }}
                >
                  Active Status
                </div>
                <span
                  className="text-xs font-bold underline cursor-pointer"
                  style={{ color: currentHex }}
                >
                  Text Link
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CIRCULAR LOGO ADJUSTER & FILTER MODAL */}
      {showCropModal && cropImageSrc && cropImgElement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isUploadingLogo) {
              setShowCropModal(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }
          }}
        >
          <div
            className="bg-white rounded-2xl border border-[#e8ecf2] shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-5 max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f4f8]">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: currentHex }}
                >
                  <Crop size={17} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0f1d33]">
                    Adjust & Align Logo (Circle Format)
                  </h3>
                  <p className="text-xs text-[#5a6a80]">
                    Drag to align inside the circle • Use zoom, filters, and rotation controls below
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCropModal(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isUploadingLogo}
                className="text-[#8a99ad] hover:text-[#0f1d33] p-1.5 rounded-lg hover:bg-[#f1f4f8] transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Viewport Frame */}
            <div className="relative bg-[#0b1320] rounded-2xl p-6 flex flex-col items-center justify-center select-none overflow-hidden border border-[#1e2a3a]">
              {/* Circular Viewport Window */}
              <div
                className="relative w-[240px] h-[240px] rounded-full overflow-hidden border-2 border-brand shadow-[0_0_0_9999px_rgba(11,19,32,0.88)] cursor-grab active:cursor-grabbing flex items-center justify-center touch-none"
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
                title="Click and drag to position logo"
              >
                {/* Image under transformation */}
                <img
                  src={cropImageSrc}
                  alt="Crop Target"
                  draggable={false}
                  style={{
                    width: `${cropImgElement.naturalWidth * Math.min(240 / cropImgElement.naturalWidth, 240 / cropImgElement.naturalHeight)}px`,
                    height: `${cropImgElement.naturalHeight * Math.min(240 / cropImgElement.naturalWidth, 240 / cropImgElement.naturalHeight)}px`,
                    transform: `translate(${cropPan.x}px, ${cropPan.y}px) scale(${cropZoom})`,
                    transformOrigin: 'center center',
                  }}
                  className="pointer-events-none select-none max-w-none transition-none"
                />

                {/* Faint Center Alignment Crosshairs */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-25">
                  <div className="w-full h-px border-b border-dashed border-white" />
                  <div className="h-full w-px border-r border-dashed border-white absolute" />
                </div>
              </div>

              {/* Interaction Hint */}
              <div className="mt-3.5 flex items-center gap-1.5 text-[11px] text-[#93a4b8] font-medium">
                <Move size={12} className="text-brand" />
                <span>Drag inside circle to move • Output is exported in crisp circle format</span>
              </div>
            </div>

            {/* Controls: Zoom & Quick Alignment */}
            <div className="space-y-4">
              {/* Row 1: Zoom Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#0f1d33] flex items-center gap-1.5">
                    <Sliders size={13} className="text-[#5a6a80]" />
                    Zoom & Scale
                  </span>
                  <span className="font-mono font-semibold text-[#0f1d33]">
                    {Math.round(cropZoom * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCropZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))))}
                    className="p-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#edf2f7] text-[#5a6a80]"
                    title="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.05"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-[#e2e8f0] rounded-lg appearance-none cursor-pointer accent-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setCropZoom((prev) => Math.min(3.0, Number((prev + 0.1).toFixed(2))))}
                    className="p-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#edf2f7] text-[#5a6a80]"
                    title="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>

              {/* Row 2: Alignment Shortcuts */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleFitToCircle}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#edf2f7] text-[#0f1d33] transition-colors flex items-center gap-1.5"
                >
                  <Minimize2 size={13} />
                  Fit to Circle
                </button>
                <button
                  type="button"
                  onClick={handleFillCircle}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#edf2f7] text-[#0f1d33] transition-colors flex items-center gap-1.5"
                >
                  <Maximize2 size={13} />
                  Fill Circle
                </button>
                <button
                  type="button"
                  onClick={handleCenterAlign}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#edf2f7] text-[#0f1d33] transition-colors flex items-center gap-1.5"
                >
                  <Move size={13} />
                  Center
                </button>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f1f4f8]">
              <button
                type="button"
                onClick={() => {
                  setShowCropModal(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isUploadingLogo}
                className="px-3.5 py-2 text-xs font-semibold text-[#5a6a80] hover:text-[#0f1d33] bg-[#f8fafc] hover:bg-[#edf2f7] rounded-xl border border-[#e2e8f0] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCropAndUpload}
                disabled={isUploadingLogo}
                className="px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-sm transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: currentHex }}
              >
                {isUploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {isUploadingLogo ? 'Cropping & Uploading...' : 'Save & Apply Circle Logo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOGO PREVIEW POPUP MODAL */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#e8ecf2] shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#f1f4f8]">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: currentHex }}
                >
                  <Eye size={15} />
                </div>
                <h3 className="text-base font-bold text-[#0f1d33]">Photo Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-[#8a99ad] hover:text-[#0f1d33] p-1.5 rounded-lg hover:bg-[#f1f4f8] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a80] block mb-1.5">
                  Light Background (Login Screen & Forms)
                </span>
                <div className="flex flex-col items-center justify-center p-6 bg-[#f8fafc] border border-[#e8ecf2] rounded-xl min-h-[110px]">
                  {settings.customLogoUrl ? (
                    <img
                      src={settings.customLogoUrl}
                      alt="Logo Preview"
                      className="max-h-16 max-w-[200px] object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-mono font-extrabold text-sm border shadow-sm"
                        style={{
                          backgroundColor: '#0f1d33',
                          color: currentHex,
                          borderColor: currentHex,
                        }}
                      >
                        CRM
                      </div>
                      <span className="text-xs text-[#5a6a80]">No custom photo uploaded</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#5a6a80] block mb-1.5">
                  Dark Background (Sidebar Header)
                </span>
                <div className="flex flex-col items-center justify-center p-6 bg-[#0f1d33] border border-black/20 rounded-xl min-h-[110px]">
                  {settings.customLogoUrl ? (
                    <img
                      src={settings.customLogoUrl}
                      alt="Logo Preview"
                      className="max-h-16 max-w-[200px] object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-mono font-extrabold text-sm border shadow-sm"
                        style={{
                          backgroundColor: '#1e3a5f',
                          color: currentHex,
                          borderColor: currentHex,
                        }}
                      >
                        CRM
                      </div>
                      <span className="text-xs text-slate-400">No custom photo uploaded</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs hover:opacity-90 transition-all"
                style={{ backgroundColor: currentHex }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
