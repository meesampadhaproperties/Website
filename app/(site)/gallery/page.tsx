import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/site/JsonLd'
import { whatsappLink } from '@/lib/site-config'
import { WhatsAppIcon } from '@/components/site/WhatsAppIcon'
import { DreamPropertyCta } from '@/components/site/DreamPropertyCta'
import { GalleryGrid } from '@/components/site/GalleryGrid'
import { AutoRefresh } from '@/components/site/AutoRefresh'
import { getPublishedGallery } from '@/lib/website-projects'

export const metadata: Metadata = {
  title: 'Gallery: Project Photos & Videos | Mee Sampadha',
  description: 'Browse photos and videos of Mee Sampadha plots, villas and flats around Hyderabad. See the layouts, roads and surroundings before you visit.',
  alternates: { canonical: '/gallery' },
}

// Rebuilt at most every 5 minutes; saving in CRM → Website Projects refreshes it right away (revalidatePath).
export const revalidate = 300

const wrap = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'
const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-gold'

export default async function GalleryPage() {
  const projects = await getPublishedGallery()
  const hasPictures = projects.length > 0 // photos and/or videos

  return (
    <>
      <Breadcrumbs name="Gallery" path="/gallery" />
      <AutoRefresh />
      <section className="bg-site-ink text-white">
        <div className={`${wrap} ${hasPictures ? 'py-12 sm:py-16' : 'py-16 sm:py-24'}`}>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Gallery</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75">
            {hasPictures
              ? 'Photos and videos from our projects. Switch between them, then pick a project to see its layout, roads and surroundings.'
              : 'Project photos and videos are coming soon. Ask us on WhatsApp and we will share them for the projects you are interested in.'}
            {' '}Looking for details? <Link href="/projects" className="font-semibold text-site-gold underline underline-offset-4">See our projects</Link>.
          </p>
          {!hasPictures && (
            <div className="mt-8">
              <a href={whatsappLink('Hi Mee Sampadha, please share project pictures.')} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#25d366] text-site-ink hover:brightness-105`}>
                <WhatsAppIcon className="h-5 w-5" /> Get project pictures
              </a>
            </div>
          )}
        </div>
      </section>

      {hasPictures && <GalleryGrid projects={projects} />}

      <DreamPropertyCta />
    </>
  )
}
