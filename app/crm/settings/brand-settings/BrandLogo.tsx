'use client';

import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  getStoredBrandSettings,
  BrandSettings,
  DEFAULT_BRAND_SETTINGS,
  COLOR_PALETTES,
} from '@/lib/branding';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  showContainer?: boolean;
  inline?: boolean;
}

export function BrandLogo({
  className = '',
  size = 'md',
  showContainer = true,
  inline = false,
}: BrandLogoProps) {
  const [branding, setBranding] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBranding(getStoredBrandSettings());

    const handleUpdate = () => {
      setBranding(getStoredBrandSettings());
    };

    window.addEventListener('crm-branding-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('crm-branding-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const activeBranding = mounted ? branding : DEFAULT_BRAND_SETTINGS;
  const palette = COLOR_PALETTES.find((p) => p.id === activeBranding.paletteId) || COLOR_PALETTES[0];
  const accentColor = activeBranding.customAccent || palette.accent;

  const sizeClasses: Record<string, string> = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-14 h-14 text-sm',
    xl: 'w-20 h-20 text-lg',
    '2xl': 'w-24 h-24 text-2xl',
    '3xl': 'w-32 h-32 text-3xl',
  };

  // Inline mode: Ideal for top navbar and sidebars
  if (inline) {
    if (activeBranding.customLogoUrl) {
      return (
        <img
          src={activeBranding.customLogoUrl}
          alt="Brand Logo"
          suppressHydrationWarning
          className={`object-contain ${
            size === 'sm' ? 'max-h-9 max-w-[56px]' : 'max-h-12 max-w-[160px]'
          } ${className}`}
        />
      );
    }

    return (
      <div
        suppressHydrationWarning
        className={`w-8 h-8 rounded-lg bg-gradient-to-br from-[#0f1d33] to-[#1e3a5f] flex items-center justify-center shadow-xs shrink-0 select-none ${className}`}
      >
        <Building2 className="w-5 h-5 text-white" />
      </div>
    );
  }

  // If user uploaded a custom logo image
  if (activeBranding.customLogoUrl) {
    const imgMaxHeight = {
      '3xl': 'max-h-32',
      '2xl': 'max-h-24 sm:max-h-28',
      xl: 'max-h-20',
      lg: 'max-h-16',
      md: 'max-h-14',
      sm: 'max-h-11',
    }[size] || 'max-h-16';

    const maxW = {
      '3xl': 'max-w-[400px]',
      '2xl': 'max-w-[320px]',
      xl: 'max-w-[280px]',
      lg: 'max-w-[220px]',
      md: 'max-w-[200px]',
      sm: 'max-w-[56px]',
    }[size] || 'max-w-[280px]';

    return (
      <div className={`flex items-center justify-center shrink-0 max-w-full ${className}`}>
        <img
          src={activeBranding.customLogoUrl}
          alt="Company Logo"
          suppressHydrationWarning
          className={`object-contain w-auto h-auto ${imgMaxHeight} ${maxW} rounded-xl transition-transform`}
        />
      </div>
    );
  }

  // Clean, professional default brand emblem (real estate motif without the letters "CRM")
  const defaultMark = (
    <Building2
      className={
        size === '3xl'
          ? 'w-18 h-18'
          : size === '2xl'
          ? 'w-14 h-14'
          : size === 'xl'
          ? 'w-10 h-10'
          : size === 'lg'
          ? 'w-8 h-8'
          : size === 'md'
          ? 'w-7 h-7'
          : 'w-5 h-5'
      }
      style={{ color: accentColor }}
    />
  );

  if (!showContainer) {
    return defaultMark;
  }

  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f1d33] to-[#1e3a5f] border border-white/10 shadow-lg shadow-[#0f1d33]/15 shrink-0 transition-transform ${sizeClasses[size] || sizeClasses['2xl']} ${className}`}
    >
      {defaultMark}
    </div>
  );
}
