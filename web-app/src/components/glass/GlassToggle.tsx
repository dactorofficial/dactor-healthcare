import React from 'react'

export interface GlassToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}

export const GlassToggle: React.FC<GlassToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  return (
    <label
      className={`inline-flex items-center cursor-pointer select-none ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        {/* Track */}
        <div
          className={`w-12 h-6.5 rounded-full transition-all duration-300 border shadow-inner ${
            checked
              ? 'bg-gradient-to-r from-brand-600 to-cyan-500 border-brand-400/50 shadow-brand-500/20'
              : 'bg-slate-200/80 border-slate-300/60'
          }`}
        />
        {/* Liquid Thumb with Specular Highlight */}
        <div
          className={`absolute top-0.5 left-0.5 w-5.5 h-5.5 rounded-full bg-white shadow-md border border-white/80 transition-transform duration-300 transform flex items-center justify-center ${
            checked ? 'translate-x-5.5' : 'translate-x-0'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full bg-slate-300 transition-colors"
            style={{
              backgroundColor: checked ? '#0284c7' : '#cbd5e1',
            }}
          />
        </div>
      </div>
      {(label || description) && (
        <div className="ml-3">
          {label && <span className="text-sm font-bold text-slate-800">{label}</span>}
          {description && (
            <p className="text-xs text-slate-500 leading-tight">{description}</p>
          )}
        </div>
      )}
    </label>
  )
}
