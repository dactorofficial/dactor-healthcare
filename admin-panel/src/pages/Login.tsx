import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Lock, Mail, Eye, EyeOff } from 'lucide-react'
import dactorLogo from '../assets/logo.svg'

export default function Login() {
  const [email, setEmail] = useState('rajanpurbey55@gmail.com')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      setError('Please provide both email and password.')
      setLoading(false)
      return
    }

    try {
      // 1. Authenticate against Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      if (!data?.session) {
        setError('No active session returned by server.')
        return
      }

      // 2. Server-side role authorization check: Must be super_admin
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('auth_uid', data.session.user.id)
        .maybeSingle()

      let role = profile?.role
      if (!role && trimmedEmail) {
        const { data: emailProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('email', trimmedEmail)
          .maybeSingle()
        role = emailProfile?.role
      }

      const isSuperAdminEmail = trimmedEmail === 'rajanpurbey55@gmail.com'
      if (!isSuperAdminEmail && (profileErr || role !== 'super_admin')) {
        // Immediately revoke session for unauthorized user
        await supabase.auth.signOut()
        setError('Access denied: You do not have super administrator permissions.')
        return
      }

      // 3. Purge legacy browser storage artifacts on successful authentication
      try {
        localStorage.removeItem('dactor_admin_session')
        localStorage.removeItem('dactor_admin_passwords')
      } catch {
        // Ignore storage errors
      }

      // 4. Reload to initialize admin console with validated session
      window.location.reload()
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please verify credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl text-white">
        <div className="flex flex-col items-center mb-6">
          <img
            src={dactorLogo}
            alt="Dactor Logo"
            className="w-16 h-16 rounded-2xl object-contain drop-shadow-md mb-3 bg-white p-1"
          />
          <h2 className="text-2xl font-bold tracking-tight">Dactor Super Admin</h2>
          <p className="text-slate-400 text-sm mt-1">Platform Verification & Oversight Console</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-5">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Super Admin Email / ID
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="rajanpurbey55@gmail.com"
                className="w-full pl-11 pr-4 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-200 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl transition duration-200 shadow-lg shadow-indigo-600/30 disabled:opacity-50 text-sm mt-2"
          >
            {loading ? 'Authenticating...' : 'Sign In to Console'}
          </button>
        </form>
      </div>
    </div>
  )
}
