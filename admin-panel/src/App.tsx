import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { updateAdminPassword } from './lib/adminPassword'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ClinicVerification from './pages/ClinicVerification'
import DoctorKYC from './pages/DoctorKYC'
import ClinicEditor from './pages/ClinicEditor'
import BroadcastNotification from './pages/BroadcastNotification'
import ClinicActivation from './pages/ClinicActivation'
import PaymentLogs from './pages/PaymentLogs'
import PaymentGateways from './pages/PaymentGateways'
import PayAtDeskSettlements from './pages/PayAtDeskSettlements'
import MedicalTaxonomy from './pages/MedicalTaxonomy'
import RecycleBin from './pages/RecycleBin'
import SupportSettings from './pages/SupportSettings'
import AppVersionManager from './pages/AppVersionManager'
import SupportTickets from './pages/SupportTickets'
import NotFound from './pages/NotFound'
import ErrorBoundary from './components/ErrorBoundary'
import {
  LayoutDashboard,
  Building2,
  UserCog,
  Edit,
  Bell,
  LogOut,
  CreditCard,
  Banknote,
  DollarSign,
  Stethoscope,
  Trash2,
  Key,
  KeyRound,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Globe,
  Headphones,
  ArrowUpCircle,
} from 'lucide-react'
import dactorLogo from './assets/logo.svg'

// Purge legacy client-side admin session and password storage on module initialization
try {
  localStorage.removeItem('dactor_admin_session')
  localStorage.removeItem('dactor_admin_passwords')
} catch {
  // Ignore localStorage access errors
}

function App() {
  const [archivedCount, setArchivedCount] = useState<number>(0)
  const [pendingTicketsCount, setPendingTicketsCount] = useState<number>(0)
  const [pendingDeskSettlementsCount, setPendingDeskSettlementsCount] = useState<number>(0)
  const [session, setSession] = useState<any>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentPath, setCurrentPath] = useState('/dashboard')

  // Change Password Modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')

  useEffect(() => {
    // Purge legacy storage keys on mount
    try {
      localStorage.removeItem('dactor_admin_session')
      localStorage.removeItem('dactor_admin_passwords')
    } catch {
      // Ignore storage errors
    }

    let isMounted = true

    const validateAndSetSession = async (currentSession: any) => {
      if (!currentSession?.user) {
        if (isMounted) {
          setSession(null)
          setCheckingAuth(false)
        }
        return
      }

      // Verify that authenticated user has profiles.role === 'super_admin'
      try {
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('role')
          .eq('auth_uid', currentSession.user.id)
          .maybeSingle()

        let role = profile?.role
        if (!role && currentSession.user.email) {
          const { data: emailProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('email', currentSession.user.email.toLowerCase())
            .maybeSingle()
          role = emailProfile?.role
        }

        const isSuperAdminEmail = currentSession.user.email?.toLowerCase() === 'rajanpurbey55@gmail.com'
        if (!isSuperAdminEmail && (profileErr || role !== 'super_admin')) {
          console.warn('Unauthorized admin access attempt; revoking session.')
          await supabase.auth.signOut()
          if (isMounted) {
            setSession(null)
            setCheckingAuth(false)
          }
          return
        }

        if (isMounted) {
          setSession(currentSession)
          setCheckingAuth(false)
        }
      } catch (e) {
        console.warn('Role verification failed:', e)
        await supabase.auth.signOut()
        if (isMounted) {
          setSession(null)
          setCheckingAuth(false)
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      validateAndSetSession(initialSession)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT' || !newSession) {
        if (isMounted) {
          setSession(null)
          setCheckingAuth(false)
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        validateAndSetSession(newSession)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const fetchCounters = async () => {
      try {
        const { count: cCount } = await supabase
          .from('clinics')
          .select('*', { count: 'exact', head: true })
          .eq('is_archived', true)
        if (cCount !== null) setArchivedCount(cCount)
      } catch (e) {
        console.warn('Error fetching archived count:', e)
      }

      try {
        const { count: tCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .or('type.eq.support_ticket,title.ilike.%[Support%')
          .eq('is_read', false)
        if (tCount !== null) setPendingTicketsCount(tCount)
      } catch (e) {
        console.warn('Error fetching pending tickets count:', e)
      }

      try {
        const { count: dCount } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('payment_mode', 'PAY_AT_DESK')
        if (dCount !== null) setPendingDeskSettlementsCount(dCount)
      } catch (e) {
        console.warn('Error fetching desk settlements count:', e)
      }
    }
    fetchCounters()
    const interval = setInterval(fetchCounters, 12000)
    return () => clearInterval(interval)
  }, [currentPath])

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('dactor_admin_session')
      localStorage.removeItem('dactor_admin_passwords')
    } catch {
      // Ignore storage errors
    }
    await supabase.auth.signOut()
    setSession(null)
  }

  const adminEmail: string =
    session?.user?.email || session?.email || ''

  const openChangePasswordModal = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowCurrentPwd(false)
    setShowNewPwd(false)
    setShowConfirmPwd(false)
    setPwdError('')
    setPwdSuccess('')
    setShowPasswordModal(true)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdError('')
    setPwdSuccess('')

    const cur = currentPassword.trim()
    const next = newPassword.trim()
    const conf = confirmPassword.trim()

    if (!cur) {
      setPwdError('Please enter your current password.')
      return
    }
    if (next.length < 6) {
      setPwdError('New password must be at least 6 characters long.')
      return
    }
    if (next !== conf) {
      setPwdError('New password and confirmation do not match.')
      return
    }
    if (cur === next) {
      setPwdError('New password must be different from your current password.')
      return
    }

    const targetEmail = adminEmail || session?.user?.email
    if (!targetEmail) {
      setPwdError('No active admin session found. Please sign in again.')
      return
    }

    setPwdLoading(true)
    try {
      const result = await updateAdminPassword(targetEmail, cur, next)
      if (!result.success) {
        setPwdError(result.error || 'Failed to update password.')
      } else {
        setPwdSuccess('Password updated! Use your new password next time you sign in.')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err: any) {
      setPwdError(err?.message || 'Unexpected error while updating password.')
    } finally {
      setPwdLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
        Initializing Dactor Console...
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  const navigate = (path: string) => setCurrentPath(path)

  const renderPage = () => {
    switch (currentPath) {
      case '/dashboard': return <Dashboard onNavigate={navigate} />
      case '/clinics': return <ClinicVerification />
      case '/activation': return <ClinicActivation />
      case '/payments': return <PaymentLogs onNavigate={navigate} />
      case '/payment-gateways': return <PaymentGateways onNavigate={navigate} />
      case '/pay-at-desk': return <PayAtDeskSettlements onNavigate={navigate} />
      case '/doctors': return <DoctorKYC />
      case '/taxonomy': return <MedicalTaxonomy initialTab="specialties" />
      case '/locations': return <MedicalTaxonomy initialTab="locations" />
      case '/editor': return <ClinicEditor />
      case '/broadcast': return <BroadcastNotification />
      case '/recycle-bin': return <RecycleBin />
      case '/tickets': return <SupportTickets />
      case '/support-settings': return <SupportSettings />
      case '/app-versions': return <AppVersionManager onNavigate={navigate} />
      default: return <NotFound currentPath={currentPath} onNavigate={navigate} />
    }
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-900 text-slate-100 font-sans antialiased overflow-hidden">
        {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <img
            src={dactorLogo}
            alt="Dactor Logo"
            className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 shadow-md shadow-indigo-600/30"
          />
          <div className="min-w-0">
            <div className="font-bold text-base tracking-tight text-white">Dactor Console</div>
            <div className="text-xs text-indigo-400 font-medium truncate" title={adminEmail}>
              {adminEmail}
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/dashboard' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => navigate('/activation')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/activation' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Clinic Activations</span>
          </button>

          <button
            onClick={() => navigate('/payments')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/payments' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Payment Logs & Ledger</span>
          </button>

          <button
            onClick={() => navigate('/payment-gateways')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/payment-gateways' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Key className="w-4 h-4 text-amber-400" />
            <span>Payment Gateways & Demo</span>
          </button>

          <button
            onClick={() => navigate('/pay-at-desk')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/pay-at-desk'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Banknote className={`w-4 h-4 ${currentPath === '/pay-at-desk' ? 'text-slate-950' : 'text-amber-400'}`} />
              <span>Pay at Desk Settlements</span>
            </div>
            {pendingDeskSettlementsCount > 0 && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                currentPath === '/pay-at-desk' ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {pendingDeskSettlementsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/clinics')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/clinics' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Clinic Verification</span>
          </button>

          <button
            onClick={() => navigate('/doctors')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/doctors' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserCog className="w-4 h-4" />
            <span>Doctor KYC & License</span>
          </button>

          <button
            onClick={() => navigate('/taxonomy')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/taxonomy' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Medical Taxonomy</span>
          </button>

          <button
            onClick={() => navigate('/locations')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/locations' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Cities Dropdown Manager</span>
          </button>

          <button
            onClick={() => navigate('/editor')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/editor' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Edit className="w-4 h-4" />
            <span>Master Clinic Editor</span>
          </button>

          <button
            onClick={() => navigate('/broadcast')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/broadcast' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Broadcast Alerts</span>
          </button>

          <button
            onClick={() => navigate('/recycle-bin')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/recycle-bin' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Trash2 className="w-4 h-4" />
              <span>Recycle Bin</span>
            </div>
            {archivedCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {archivedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/tickets')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/tickets'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Headphones className="w-4 h-4 text-purple-400" />
              <span>Support Tickets</span>
            </div>
            {pendingTicketsCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingTicketsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/support-settings')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/support-settings' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Support & Helpdesk</span>
          </button>

          <button
            onClick={() => navigate('/app-versions')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              currentPath === '/app-versions' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
            <span>App Version Control</span>
          </button>
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-1">
          <button
            onClick={openChangePasswordModal}
            className="w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900 hover:text-white transition"
          >
            <KeyRound className="w-4 h-4 text-indigo-400" />
            <span>Change Password</span>
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto p-8 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          {renderPage()}
        </div>
      </main>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Change Admin Password</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[260px]">{adminEmail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/60 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {pwdError && (
                <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{pwdError}</span>
                </div>
              )}

              {pwdSuccess && (
                <div className="flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs p-3 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{pwdSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPwd ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd(v => !v)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(v => !v)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(v => !v)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700/60 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition"
                >
                  {pwdLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  )
}

export default App
