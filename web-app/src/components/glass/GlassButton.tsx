import React from 'react'
import { Loader2 } from 'lucide-react'

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'danger' | 'emerald' | 'success'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'pill'
  pill?: boolean
  fullWidth?: boolean
  loading?: boolean
  icon?: React.ReactNode
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  children?: React.ReactNode
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  variant = 'primary',
  size = 'md',
  pill = false,
  fullWidth = false,
  loading = false,
  icon,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const sizeClasses = {
    xs: 'px-2.5 py-1 text-xs gap-1',
    sm: 'px-3.5 py-1.5 text-xs font-semibold gap-1.5',
    md: 'px-4 py-2 text-sm font-semibold gap-2',
    lg: 'px-6 py-3 text-base font-bold gap-2.5',
    pill: 'px-5 py-2 text-sm font-semibold gap-2 rounded-full',
  }[size]

  const radiusClass = pill || size === 'pill' ? 'rounded-full' : 'rounded-xl sm:rounded-2xl'
  const widthClass = fullWidth ? 'w-full' : ''

  const resolvedVariant =
    variant === 'danger'
      ? 'destructive'
      : variant === 'success'
      ? 'emerald'
      : variant

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-brand-600 via-sky-600 to-cyan-600 text-white shadow-glass-brand border border-white/30 hover:brightness-105 hover:shadow-lg focus-visible:ring-brand-500',
    secondary:
      'bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-white/60 dark:border-slate-700/60 shadow-glass-sm backdrop-blur-md focus-visible:ring-brand-400',
    ghost:
      'bg-transparent hover:bg-white/60 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-white/40 dark:hover:border-slate-700/50 focus-visible:ring-slate-400',
    destructive:
      'bg-rose-500/90 hover:bg-rose-600 text-white border border-rose-300/30 shadow-md shadow-rose-500/20 focus-visible:ring-rose-500',
    emerald:
      'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20 border border-white/30 hover:brightness-105 focus-visible:ring-emerald-500',
  }[resolvedVariant]

  const startIcon = leftIcon ?? icon

  return (
    <button
      className={`relative inline-flex items-center justify-center font-medium transition-all duration-200 select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] liquid-press liquid-sheen disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 ${radiusClass} ${sizeClasses} ${variantClasses} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {/* Specular Edge Line */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] rounded-t-full bg-gradient-to-r from-transparent via-white/50 to-transparent"
        aria-hidden="true"
      />

      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {startIcon && <span className="shrink-0">{startIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  )
}
