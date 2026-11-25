'use client'

import { Key } from 'lucide-react'
import BrandingSettings from './brand-settings/BrandingSettings'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import CompanyNameSettings from './CompanyNameSettings'

export default function SettingsClient({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0f1d33]">Settings</h1>
        <p className="mt-1 text-sm text-[#5a6a82]">
          Manage your brand appearance, company logo, color palette, and account security.
        </p>
      </div>

      {/* Side-by-Side Layout: Branding on Left, Password & Security on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Branding Settings */}
        <div className="lg:col-span-7">
          <BrandingSettings />
        </div>

        {/* Right Column: Password & Account Security */}
        <div className="lg:col-span-5 space-y-6">
          {isSuperAdmin && <CompanyNameSettings />}
          <div className="rounded-2xl border border-[#e8ecf2] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#e8ecf2] px-6 py-5 bg-[#fafbfc]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0f1d33] flex items-center justify-center text-brand shadow-xs">
                  <Key size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0f1d33]">Change Password</h2>
                  <p className="text-xs text-[#5a6a82]">Update the password used to sign in to your CRM.</p>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-6">
              <ChangePasswordForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
