// Gold sun with rays. Rises into place on load, then the rays turn slowly and the core breathes (see globals.css).
export function HeroSun({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={`sun-rise pointer-events-none drop-shadow-[0_0_28px_rgba(245,176,64,0.45)] ${className}`} fill="none">
      <defs>
        <radialGradient id="hero-sun-fill" cx="35%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffe2a0" />
          <stop offset="0.6" stopColor="#f5b040" />
          <stop offset="1" stopColor="#df8c14" />
        </radialGradient>
      </defs>
      <g className="sun-rays">
      {Array.from({ length: 16 }, (_, k) => {
        const a = (k * 22.5 * Math.PI) / 180
        const r1 = 66, r2 = k % 2 === 0 ? 96 : 84
        return <line key={k} x1={100 + r1 * Math.cos(a)} y1={100 + r1 * Math.sin(a)} x2={100 + r2 * Math.cos(a)} y2={100 + r2 * Math.sin(a)} stroke="#f5b040" strokeWidth="5" strokeLinecap="round" />
      })}
      </g>
      <circle cx="100" cy="100" r="50" fill="url(#hero-sun-fill)" className="sun-core" />
    </svg>
  )
}
