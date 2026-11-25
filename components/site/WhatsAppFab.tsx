import { WhatsAppIcon } from './WhatsAppIcon'
import { whatsappLink } from '@/lib/site-config'

// Always-visible WhatsApp shortcut. Plain link: no client JS.
export function WhatsAppFab() {
  return (
    <a
      href={whatsappLink('Hi Mee Sampadha, I would like to know more about your properties.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Mee Sampadha on WhatsApp"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg shadow-black/30 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-gold sm:bottom-6 sm:right-6"
    >
      <WhatsAppIcon className="h-8 w-8" />
    </a>
  )
}
