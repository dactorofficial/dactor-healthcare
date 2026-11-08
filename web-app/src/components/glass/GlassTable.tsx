import React from 'react'

export interface GlassTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string
  children?: React.ReactNode
}

export const GlassTable: React.FC<GlassTableProps> = ({
  wrapperClassName = '',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`w-full overflow-hidden rounded-2xl sm:rounded-3xl liquid-glass-base border border-white/60 shadow-glass-md ${wrapperClassName}`}
    >
      <div className="overflow-x-auto scrollbar-none">
        <table className={`w-full text-left border-collapse text-sm ${className}`} {...props}>
          {children}
        </table>
      </div>
    </div>
  )
}

export const GlassTableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <thead
    className={`bg-white/60 border-b border-slate-200/60 text-xs font-bold uppercase tracking-wider text-slate-500 ${className}`}
    {...props}
  >
    {children}
  </thead>
)

export const GlassTableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <tr
    className={`border-b border-slate-100/60 hover:bg-white/50 transition-colors ${className}`}
    {...props}
  >
    {children}
  </tr>
)

export const GlassTableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <td className={`px-4 sm:px-6 py-3.5 sm:py-4 text-slate-700 font-medium ${className}`} {...props}>
    {children}
  </td>
)
