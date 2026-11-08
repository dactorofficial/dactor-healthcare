import React from 'react'

export interface GlassBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'brand'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'neutral'
    | 'default'
    | 'info'
    | 'success'
    | 'warning'
    | 'danger'
    | 'indigo'
    | 'purple'
  size?: 'xs' | 'sm' | 'md'
  dot?: boolean
  pulse?: boolean
  icon?: React.ReactNode
  children?: React.ReactNode
}

export const GlassBadge: React.FC<GlassBadgeProps> = ({
  variant = 'brand',
  size = 'sm',
  dot = false,
  pulse = false,
  icon,
  className = '',
  children,
  ...props
}) => {
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[10px] gap-1',
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-xs font-bold gap-2',
  }[size]

  const resolvedVariant =
    variant === 'info'
      ? 'brand'
      : variant === 'success'
      ? 'emerald'
      : variant === 'warning'
      ? 'amber'
      : variant === 'danger'
      ? 'rose'
      : variant === 'default'
      ? 'neutral'
      : variant

  const variantClasses = {
    brand:
      'bg-brand-50/80 dark:bg-brand-900/35 text-brand-700 dark:text-brand-300 border-brand-200/60 dark:border-brand-700/50 shadow-xs shadow-brand-500/10',
    emerald:
      'bg-emerald-50/80 dark:bg-emerald-900/35 text-emerald-800 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/50 shadow-xs shadow-emerald-500/10',
    amber:
      'bg-amber-50/80 dark:bg-amber-900/35 text-amber-800 dark:text-amber-300 border-amber-200/60 dark:border-amber-700/50 shadow-xs shadow-amber-500/10',
    rose:
      'bg-rose-50/80 dark:bg-rose-900/35 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-700/50 shadow-xs shadow-rose-500/10',
    indigo:
      'bg-indigo-50/80 dark:bg-indigo-900/35 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-700/50 shadow-xs shadow-indigo-500/10',
    purple:
      'bg-purple-50/80 dark:bg-purple-900/35 text-purple-700 dark:text-purple-300 border-purple-200/60 dark:border-purple-700/50 shadow-xs shadow-purple-500/10',
    neutral:
      'bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-white/60 dark:border-slate-700/60 shadow-xs',
  }[resolvedVariant]

  const dotClasses = {
    brand: 'bg-brand-500 animate-pulse',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500 animate-ping',
    rose: 'bg-rose-500',
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
    neutral: 'bg-slate-400',
  }[resolvedVariant]

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border backdrop-blur-md transition-all duration-200 select-none ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses} ${
            pulse ? 'animate-pulse' : ''
          }`}
        />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  )
}
