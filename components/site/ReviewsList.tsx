import { YouTubeEmbed } from '@/components/site/YouTubeEmbed'
import type { PublicReview } from '@/lib/website-projects'

/** Public /reviews: one card per YouTube review, a click-to-play preview with the title below it. */
export function ReviewsList({ reviews }: { reviews: PublicReview[] }) {
  return (
    <div className="bg-[#f5f2ea]">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map(r => (
            <li key={r.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e8e2d4] bg-[#fbfaf6] shadow-[0_1px_3px_rgba(20,40,29,0.06)]">
              <YouTubeEmbed id={r.youtube_id} title={r.title} />
              <h2 className="px-4 pb-4 pt-3 font-display text-lg font-semibold leading-snug text-[#14281d] break-words sm:px-5">{r.title}</h2>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
