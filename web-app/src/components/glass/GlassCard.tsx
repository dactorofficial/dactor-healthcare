import React from 'react'

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'subtle' | 'base' | 'elevated' | 'modal'
  intensity?: 'subtle' | 'base' | 'elevated' | 'modal'
  variant?: 'subtle' | 'base' | 'elevated' | 'modal' | 'default'
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  hoverEffect?: boolean
  interactive?: boolean
  specular?: boolean
  sheen?: boolean
  radius?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  children?: React.ReactNode
}

export const GlassCard: React.FC<GlassCardProps> = ({
  elevation,
  intensity,
  variant,
  padding = 'none',
  hoverEffect = true,
  interactive = false,
  specular = false,
  sheen = false,
  radius = 'lg',
  className = '',
  children,
  ...props
}) => {
  const resolvedElevation =
    intensity ||
    elevation ||
    (variant === 'default' ? 'base' : variant) ||
    'base'

  const radiusClasses = {
    sm: 'rounded-xl',
    md: 'rounded-2xl',
    lg: 'rounded-3xl',
    xl: 'rounded-[32px]',
  }[radius]

  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
    xl: 'p-8',
  }[padding]

  const elevationClass = {
    subtle: 'liquid-glass-subtle',
    base: 'liquid-glass-base',
    elevated: 'liquid-glass-elevated',
    modal: 'liquid-glass-modal',
  }[resolvedElevation]

  const sheenClass = specular || sheen ? 'liquid-sheen' : ''
  const interactiveClass = interactive ? 'liquid-glass-card-interactive' : ''

  return (
    <div
      className={`${radiusClasses} ${
        hoverEffect ? `liquid-glass-card ${elevationClass}` : elevationClass
      } ${paddingClasses} ${sheenClass} ${interactiveClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
