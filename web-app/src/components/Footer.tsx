import React from 'react'
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  ShieldCheck,
  Heart,
  ChevronRight,
  LifeBuoy,
  Headphones,
} from 'lucide-react'
import dactorLogo from '../assets/logo.svg'

interface FooterProps {
  onNavigate: (tab: string, params?: any) => void
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="relative bg-slate-950/85 backdrop-blur-2xl text-slate-300 pt-12 sm:pt-16 pb-28 lg:pb-12 border-t border-white/10 shadow-2xl overflow-hidden">
      {/* Specular Perimeter Line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-10 pb-10 border-b border-white/10">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center space-x-3">
              <img
                src={dactorLogo}
                alt="Dactor Logo"
                className="w-10 h-10 rounded-2xl object-contain shadow-glass-brand bg-white/90 p-0.5 border border-white/30 backdrop-blur-md"
              />
              <span className="text-2xl font-black tracking-tight text-white">Dactor</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              Empowering healthcare facilities with real-time OPD queue transparency, seamless doctor consultations, and 3-stage diagnostic lab tracking with verified report delivery.
            </p>
            <div className="pt-2 flex items-center space-x-3 text-xs text-slate-400">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-cyan-950/70 text-cyan-300 border border-cyan-500/30 font-medium shadow-xs backdrop-blur-md">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                Verified Clinics & Doctors
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 text-slate-200 border border-white/10 font-medium shadow-xs backdrop-blur-md">
                <Clock className="w-3.5 h-3.5 mr-1" />
                Zero Queue Waiting
              </span>
            </div>
          </div>

          {/* Patient Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">For Patients</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('patient-portal')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left text-cyan-400 font-bold"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Patient Portal (My Health)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('home', { intentionalHome: true })}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>OPD Schedule & Doctors</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('clinics')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Find Clinics & OPD</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('lab-reports')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Download Lab Reports</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('average-time')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Live Wait Time Insights</span>
                </button>
              </li>
              <li>
                <a
                  href="./privacy-patient.html"
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 text-left text-slate-300 hover:underline"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Patient Privacy Policy</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Clinics & Healthcare Providers */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">For Providers</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => onNavigate('portal')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Clinic & Lab Center</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('doctor-portal')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Doctor Consultation Desk</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('portal')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Lab Technicians & Rates</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('portal')}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Reception Walk-In Tokens</span>
                </button>
              </li>
              <li>
                <a
                  href="./privacy-clinic.html"
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 text-left text-slate-300 hover:underline"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Clinic Privacy Policy</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Contact & Support */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Help & Contact</h4>
            <div className="space-y-2.5 text-sm text-slate-400">
              <div className="pt-0.5">
                <button
                  onClick={() => {
                    window.location.hash = '#support?view=track'
                    onNavigate('support')
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 border border-cyan-400/40 text-cyan-300 hover:text-white font-bold text-xs transition cursor-pointer hover:bg-cyan-500/30 shadow-xs"
                >
                  <LifeBuoy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Check Help Request Status</span>
                </button>
              </div>
              <div className="flex items-start space-x-2.5">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>Kathmandu & All Nepal Medical Hubs</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>dactorofficial@gmail.com</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <Phone className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>OPD Support Desk / Hotline</span>
              </div>
              <div className="pt-1 flex flex-col space-y-1.5">
                <button
                  onClick={() => {
                    window.location.hash = '#support'
                    onNavigate('support')
                  }}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left text-xs text-slate-400"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Submit New Help Request</span>
                </button>
                <button
                  onClick={() => {
                    window.location.hash = '#support?view=track'
                    onNavigate('support')
                  }}
                  className="hover:text-cyan-400 transition-colors flex items-center space-x-1 cursor-pointer text-left text-xs text-slate-400"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Track Ticket Status</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Notice & Copyright */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p className="max-w-2xl text-slate-400 leading-normal">
            <strong className="text-rose-400 font-semibold">Medical Notice:</strong> Dactor is designed for scheduled OPD clinic visits, token tracking, and diagnostic reports. If you are experiencing an acute medical emergency, please call your local emergency service or proceed to an emergency room immediately.
          </p>
          <div className="flex items-center space-x-1 shrink-0 text-slate-400">
            <span>© {new Date().getFullYear()} Dactor Health. Built with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 mx-0.5" />
            <span>for better care.</span>
          </div>
        </div>

        {/* Legal & Regulatory Policies Bar */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 border-t border-white/5 mt-4">
          <a href="./privacy-patient.html" className="hover:text-cyan-400 transition">Patient Privacy Policy</a>
          <span>•</span>
          <a href="./privacy-clinic.html" className="hover:text-cyan-400 transition">Clinic &amp; Provider Privacy Policy</a>
          <span>•</span>
          <a href="https://dactorofficial.github.io/support" className="hover:text-cyan-400 transition">Healthcare Helpdesk</a>
        </div>
      </div>
    </footer>
  )
}
