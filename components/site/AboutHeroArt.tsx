// Line-art street of homes that draws itself once: apartments either side, a house in the middle.
const draw = (i: number) => ({ '--d': `${200 + i * 160}ms` } as React.CSSProperties)

function Windows({ x, y, cols, rows, gap, start }: { x: number; y: number; cols: number; rows: number; gap: number; start: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (
        <rect key={`${r}-${c}`} x={x + c * gap} y={y + r * (gap + 6)} width="14" height="18" rx="2" className="draw" pathLength={1} style={draw(start + r)} />
      )))}
    </>
  )
}

export function AboutHeroArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 380" role="img" aria-label="Illustration of apartments and a house on a street" className={`about-art ${className}`} fill="none" stroke="#07090a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="430" cy="82" r="30" fill="#f5b040" stroke="none" className="fade-fill" style={draw(8)} />
      {/* sun rays */}
      {Array.from({ length: 12 }, (_, k) => {
        const a = (k * 30 * Math.PI) / 180
        const r1 = 42, r2 = k % 2 === 0 ? 62 : 54
        return <line key={k} x1={430 + r1 * Math.cos(a)} y1={82 + r1 * Math.sin(a)} x2={430 + r2 * Math.cos(a)} y2={82 + r2 * Math.sin(a)} stroke="#f5b040" strokeWidth="4" className="draw" pathLength={1} style={draw(8 + (k % 4))} />
      })}
      {/* apartment blocks */}
      <rect x="40" y="120" width="116" height="210" className="draw" pathLength={1} style={draw(0)} />
      <Windows x={58} y={140} cols={3} rows={5} gap={32} start={1} />
      <rect x="372" y="170" width="116" height="160" className="draw" pathLength={1} style={draw(1)} />
      <Windows x={390} y={190} cols={3} rows={4} gap={32} start={2} />
      {/* house */}
      <rect x="176" y="224" width="168" height="106" fill="#fff" className="draw" pathLength={1} style={draw(3)} />
      <polygon points="156,228 260,140 364,228" fill="#f5b040" className="draw" pathLength={1} style={draw(4)} />
      <rect x="312" y="158" width="22" height="40" fill="#f5b040" className="draw" pathLength={1} style={draw(5)} />
      <rect x="240" y="270" width="40" height="60" fill="#07090a" className="draw" pathLength={1} style={draw(5)} />
      <rect x="192" y="250" width="30" height="30" className="draw" pathLength={1} style={draw(6)} />
      <rect x="298" y="250" width="30" height="30" className="draw" pathLength={1} style={draw(6)} />
      {/* ground and path */}
      <path d="M10 330 H510" className="draw" pathLength={1} style={draw(7)} />
      <path d="M250 330 L228 362 M270 330 L292 362" stroke="#b87a10" className="draw" pathLength={1} style={draw(8)} />
    </svg>
  )
}
