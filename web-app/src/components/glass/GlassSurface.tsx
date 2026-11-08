import React from 'react'

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'subtle' | 'base' | 'elevated' | 'modal'
  interactive?: boolean
  className?: string
  children?: React.ReactNode
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  elevation = 'base',
  interactive = false,
  className = '',
  children,
  ...props
}) => {
  const elevationClasses = {
    subtle: 'liquid-glass-subtle',
    base: 'liquid-glass-base',
    elevated: 'liquid-glass-elevated',
    modal: 'liquid-glass-modal',
  }[elevation]

  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${elevationClasses} ${
        interactive ? 'hover:scale-[1.01] hover:shadow-glass-elevated cursor-pointer' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
