import React from 'react'

export const LiquidAuroraBackground: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 selection:bg-brand-500 selection:text-white">
      {/* Living Ambient Mesh & Aurora Spheres */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Soft Radial Ambient Lighting - lightweight blur on mobile devices for 60fps performance */}
        <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[800px] max-h-[800px] rounded-full bg-gradient-to-br from-sky-400/20 via-cyan-300/15 to-transparent blur-2xl md:blur-[110px] aurora-blob-1" />
        <div className="absolute top-[25%] -right-[15%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] rounded-full bg-gradient-to-bl from-blue-500/15 via-teal-300/12 to-transparent blur-2xl md:blur-[120px] aurora-blob-2" />
        <div className="absolute -bottom-[15%] left-[20%] w-[60vw] h-[60vw] max-w-[850px] max-h-[850px] rounded-full bg-gradient-to-tr from-sky-300/15 via-indigo-300/10 to-transparent blur-2xl md:blur-[130px] aurora-blob-3" />
        
        {/* Subtle grid texture overlay to anchor the refraction */}
        <div 
          className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
          style={{
            backgroundImage: `radial-gradient(rgba(15, 23, 42, 0.4) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* SVG Liquid Refraction Filter Definition */}
      <svg className="hidden pointer-events-none absolute" aria-hidden="true">
        <defs>
          <filter id="liquid-refraction" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* Foreground Content Tree */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {children}
      </div>
    </div>
  )
}
