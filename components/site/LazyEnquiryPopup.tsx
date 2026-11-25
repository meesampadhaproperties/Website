'use client'

import dynamic from 'next/dynamic'

// The pop-up (and its form) only appears seconds after load, so keep it out of the initial JavaScript.
const EnquiryPopup = dynamic(() => import('./EnquiryPopup').then((m) => m.EnquiryPopup), { ssr: false })

export function LazyEnquiryPopup() {
  return <EnquiryPopup />
}
