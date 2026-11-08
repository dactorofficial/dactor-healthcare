import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export interface DropdownOption {
  id: string
  label: string
  icon?: React.ReactNode
}

export interface GlassDropdownProps {
  options: DropdownOption[]
  selectedId: string
  onSelect: (id: string) => void
  label?: string
  className?: string
}

export const GlassDropdown: React.FC<GlassDropdownProps> = ({
  options,
  selectedId,
  onSelect,
  label,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === selectedId) || options[0]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {label && (
        <span className="block text-xs font-bold text-slate-700 mb-1 ml-1">{label}</span>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-2xl liquid-glass-input text-slate-800 text-sm font-semibold transition-all duration-200 cursor-pointer select-none"
      >
        <span className="flex items-center space-x-2 truncate">
          {selected?.icon && <span>{selected.icon}</span>}
          <span>{selected?.label}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 ml-2 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-full min-w-[200px] rounded-2xl liquid-glass-elevated border border-white/80 p-1.5 shadow-glass-lg animate-in fade-in zoom-in-95 duration-150">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onSelect(opt.id)
                setIsOpen(false)
              }}
              className={`flex items-center w-full px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
                opt.id === selectedId
                  ? 'bg-brand-50/90 text-brand-700 font-bold'
                  : 'text-slate-700 hover:bg-white/60'
              }`}
            >
              {opt.icon && <span className="mr-2 text-slate-500">{opt.icon}</span>}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
