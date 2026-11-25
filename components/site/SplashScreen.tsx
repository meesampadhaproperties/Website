import Image from 'next/image'

// Full-screen intro on every page load/refresh: plain white screen, logo zooming in and out, then it fades away.
// Pure CSS (see .splash in globals.css): no JavaScript needed, and it can never get stuck on screen.
// Uses the white-background version of the logo (public/brand/logo-light.png).
export function SplashScreen() {
  return (
    <div aria-hidden className="splash fixed inset-0 z-[100] flex items-center justify-center bg-white">
      <Image src="/brand/logo-light.png" alt="" width={1500} height={800} priority sizes="(max-width: 640px) 256px, 320px" className="splash-logo h-auto w-64 sm:w-80" />
    </div>
  )
}
