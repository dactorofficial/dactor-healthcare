import React from 'react'

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  trailing?: React.ReactNode
  wrapperClassName?: string
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ label, error, icon, trailing, className = '', wrapperClassName = '', ...props }, ref) => {
    return (
      <div className={`w-full ${wrapperClassName}`}>
        {label && (
          <label className="block text-xs font-bold text-slate-700 tracking-tight mb-1.5 ml-1">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 pointer-events-none text-slate-400 flex items-center justify-center">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full rounded-xl sm:rounded-2xl liquid-glass-input text-slate-800 placeholder-slate-400 text-sm font-medium transition-all duration-200 ${
              icon ? 'pl-10' : 'pl-3.5'
            } ${trailing ? 'pr-10' : 'pr-3.5'} py-2.5 sm:py-3 ${
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-400/20'
                : ''
            } ${className}`}
            {...props}
          />
          {trailing && (
            <div className="absolute right-3.5 flex items-center justify-center text-slate-400">
              {trailing}
            </div>
          )}
        </div>
        {error && <p className="mt-1 ml-1 text-xs font-semibold text-rose-500">{error}</p>}
      </div>
    )
  }
)

GlassInput.displayName = 'GlassInput'
