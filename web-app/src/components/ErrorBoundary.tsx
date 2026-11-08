import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertOctagon, RotateCw, Home, Headphones, ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard, GlassButton, GlassBadge } from './glass'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Dactor ErrorBoundary Caught Exception]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  handleSupport = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#support'
      this.setState({ hasError: false, error: null, errorInfo: null })
    }
  }

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const errorMessage = this.state.error?.message || 'An unexpected error occurred.'
      const componentStack = this.state.errorInfo?.componentStack

      return (
        <div className="min-h-screen py-16 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 font-sans">
          <div className="w-full max-w-2xl animate-fadeIn">
            <GlassCard variant="modal" className="p-8 sm:p-10 text-center relative overflow-hidden border-rose-500/30">
              {/* Ambient Glow */}
              <div className="absolute -top-20 -right-20 w-56 h-56 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center">
                <GlassBadge variant="danger" size="md" className="font-mono tracking-wider font-extrabold px-3 py-1 text-xs mb-3">
                  SYSTEM RECOVERY • CLIENT EXCEPTION
                </GlassBadge>

                {/* Pulsing Alert Icon */}
                <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center my-3 shadow-lg shadow-rose-500/10">
                  <AlertOctagon className="w-10 h-10 animate-bounce" />
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-2 mb-2">
                  Something went wrong
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium max-w-lg mb-6 leading-relaxed">
                  An unexpected issue occurred while rendering this healthcare portal view. Your account, patient records, and appointments remain safe in the cloud.
                </p>

                {/* Primary Recovery Actions */}
                <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
                  <GlassButton
                    variant="primary"
                    size="md"
                    onClick={this.handleReload}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 font-bold"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span>Reload Page</span>
                  </GlassButton>

                  <GlassButton
                    variant="secondary"
                    size="md"
                    onClick={this.handleGoHome}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 font-bold"
                  >
                    <Home className="w-4 h-4" />
                    <span>Return Home</span>
                  </GlassButton>

                  <GlassButton
                    variant="ghost"
                    size="md"
                    onClick={this.handleSupport}
                    className="w-full flex items-center justify-center gap-2 font-bold text-brand-600 dark:text-brand-400 mt-1"
                  >
                    <Headphones className="w-4 h-4" />
                    <span>Contact Dactor Support</span>
                  </GlassButton>
                </div>

                {/* Collapsible Technical Details (for support diagnostics) */}
                <div className="w-full mt-6 pt-5 border-t border-slate-200/50 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={this.toggleDetails}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center gap-1 mx-auto transition"
                  >
                    <span>{this.state.showDetails ? 'Hide' : 'View'} Diagnostic Details</span>
                    {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {this.state.showDetails && (
                    <div className="mt-3 p-4 rounded-xl bg-slate-900 text-left text-xs font-mono text-slate-300 overflow-x-auto max-h-48 border border-slate-800">
                      <p className="text-rose-400 font-bold mb-1">Error: {errorMessage}</p>
                      {componentStack && (
                        <pre className="text-[11px] text-slate-400 whitespace-pre-wrap leading-tight mt-2">
                          {componentStack.trim()}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
