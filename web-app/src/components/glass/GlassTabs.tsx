import React from 'react'

export interface TabItem {
  id: string
  label: string
  icon?: React.ReactNode
  badge?: string | number
}

export interface GlassTabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  size?: 'sm' | 'md'
  className?: string
}

export const GlassTabs: React.FC<GlassTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  size = 'md',
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center p-1 rounded-2xl liquid-glass-subtle border border-white/60 shadow-glass-sm max-w-full overflow-x-auto scrollbar-none ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex items-center space-x-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 select-none whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-white/95 text-brand-700 shadow-glass-sm border border-white/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            {tab.icon && (
              <span className={isActive ? 'text-brand-600' : 'text-slate-400'}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
