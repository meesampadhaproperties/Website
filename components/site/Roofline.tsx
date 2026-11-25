// Decorative gold roofline echoing the roof in the logo. Draws itself once on load; static under reduced motion.
export function Roofline({ className = '' }: { className?: string }) {
  const d = 'M0 190 L120 110 L170 140 L300 28 L330 52 L330 30 L350 30 L350 68 L470 170 L560 100 L640 150 L780 50 L930 170 L1010 110 L1100 160 L1240 40 L1400 190 L1600 190'
  return (
    <svg aria-hidden viewBox="0 0 1600 200" preserveAspectRatio="none" className={`roofline ${className}`} fill="none">
      <path d={d} pathLength={1} stroke="#ff69b4" strokeOpacity="0.55" strokeWidth="2" transform="translate(40 14)" />
      <path d={d} pathLength={1} stroke="#f5b040" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}
