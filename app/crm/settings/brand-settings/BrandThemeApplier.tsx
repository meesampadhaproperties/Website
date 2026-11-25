'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getStoredBrandSettings, applyBrandCSSVariables, getActiveUserStorageKey } from '@/lib/branding';

export function BrandThemeApplier() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => {
      const settings = getStoredBrandSettings();
      applyBrandCSSVariables(settings, getActiveUserStorageKey());
    };

    apply();
    window.addEventListener('crm-branding-updated', apply);
    window.addEventListener('storage', apply);

    return () => {
      window.removeEventListener('crm-branding-updated', apply);
      window.removeEventListener('storage', apply);
    };
  }, [pathname]);

  return null;
}
