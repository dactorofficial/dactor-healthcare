import React, { useState, useEffect, createContext, useContext } from 'react'
import { enCommon } from '../locales/en/common'
import { enPublicPages } from '../locales/en/publicPages'
import { enPatientPortal } from '../locales/en/patientPortal'
import { enClinicPortal } from '../locales/en/clinicPortal'
import { enDoctorPortal } from '../locales/en/doctorPortal'

import { neCommon } from '../locales/ne/common'
import { nePublicPages } from '../locales/ne/publicPages'
import { nePatientPortal } from '../locales/ne/patientPortal'
import { neClinicPortal } from '../locales/ne/clinicPortal'
import { neDoctorPortal } from '../locales/ne/doctorPortal'

export type AppLanguage = 'en' | 'ne'

export const englishTranslations = {
  ...enCommon,
  ...enPublicPages,
  ...enPatientPortal,
  ...enClinicPortal,
  ...enDoctorPortal,

  // Compatibility aliases
  track10DigitCode: 'Track 10-Digit Code',
  trackLiveQueue: 'Track Live Queue',
  navRecords: 'Records',
  navAppointments: 'Appointments',
  navProfile: 'Profile',
  mainSite: 'Main Site',
  sortFilter: 'Sort',
  sortFeeLowHigh: 'Lowest Fee First',
  sortInside: 'Inside Clinic',
  sortLowFee: 'Lowest Fee',
  sortName: 'A-Z',
  doctorsAvailable: 'verified doctors available in',
  editProfileTitle: 'Edit Profile Details',
  editProfileSub: 'Name, phone, age, gender',
  pushNotifTitle: 'Push Notifications (FCM)',
  pushNotifSub: 'Real-time live queue alerts & calls',
  clearCacheTitle: 'Clear Saved History',
  clearCacheSub: 'Reset local tracking codes on this device',
  txHistoryTitle: 'Transaction History',
  txHistorySub: 'All appointment payments, times, and transaction IDs',
  termsPolicyTitle: 'Terms & Privacy Policy',
  termsPolicySub: 'Official patient confidentiality & legal terms',
  signOutBtn: 'Sign Out',
  welcomeTitle: 'Welcome to Dactor Nepal',
  welcomeSubtitle: 'Connect with top verified medical clinics and specialist doctors. Track live queues and receive instant health alerts.',
  instantAppointments: 'Instant Clinic Appointments',
  instantAppointmentsDesc: 'Skip the long waiting lines. Browse verified specialist doctors across Nepal and reserve your guaranteed OPD slot.',
  liveQueue: 'Live Queue Tracking',
  liveQueueDesc: 'Track your token number live from home. Arrive precisely when your turn is called with zero waiting room hassle.',
  smartAlerts: 'Smart Health Alerts',
  smartAlertsDesc: 'Receive automated priority push notifications when your doctor is ready or if your token moves forward.',
  digitalReports: 'Digital Medical Records',
  digitalReportsDesc: 'Access your digital medical lab reports, consultation bills, and diagnostic records directly on your phone securely.',
  signInGoogle: 'Sign in with Google',
  continueGuest: 'Continue as Guest',
  guestExplanation: 'In Guest Mode, you can search clinics, explore doctors, and track live queues with code. Sign-in is only required to book an appointment.',
  doctorIn: 'Doctor In',
  doctorOut: 'Doctor Away',
  clinicBreak: 'Clinic On Break',
  callNext: 'Call Next',
  recall: 'Recall',
  markDone: 'Mark Completed',
  noShow: 'No-Show',
  settingsHeader: 'Settings & Account Preferences',
  appLanguageLabel: 'App Language',
  appLanguageSub: 'English',
  changeLanguageBtn: 'Change'
}

export type I18nStrings = typeof englishTranslations

export const nepaliTranslations: I18nStrings = {
  ...neCommon,
  ...nePublicPages,
  ...nePatientPortal,
  ...neClinicPortal,
  ...neDoctorPortal,

  // Compatibility aliases
  track10DigitCode: '१०-अङ्के कोडबाट ट्र्याक गर्नुहोस्',
  trackLiveQueue: 'प्रत्यक्ष लाम हेर्नुहोस्',
  navRecords: 'स्वास्थ्य रेकर्ड (Records)',
  navAppointments: 'अपोइन्टमेन्टहरू',
  navProfile: 'प्रोफाइल',
  mainSite: 'मुख्य साइट',
  sortFilter: 'फिल्टर',
  sortFeeLowHigh: 'न्यूनतम परामर्श शुल्क',
  sortInside: 'क्लिनिकभित्र',
  sortLowFee: 'न्यूनतम शुल्क',
  sortName: 'अ-ज्ञ',
  doctorsAvailable: 'प्रमाणित डाक्टरहरू उपलब्ध छन्',
  editProfileTitle: 'व्यक्तिगत विवरण सम्पादन',
  editProfileSub: 'नाम, फोन, उमेर, लिङ्ग',
  pushNotifTitle: 'पुश नोटिफिकेसन (FCM)',
  pushNotifSub: 'प्रत्यक्ष लाम अलर्ट तथा पालो बोलाइएको सूचना',
  clearCacheTitle: 'इतिहास मेटाउनुहोस्',
  clearCacheSub: 'यो डिभाइसमा सुरक्षित गरिएका ट्र्याकिङ कोडहरू हटाउनुहोस्',
  txHistoryTitle: 'कारोबार इतिहास',
  txHistorySub: 'सबै अपोइन्टमेन्ट भुक्तानी तथा कारोबार ID',
  termsPolicyTitle: 'सर्तहरू तथा गोपनीयता नीति',
  termsPolicySub: 'आधिकारिक बिरामी गोपनीयता तथा कानुनी सर्तहरू',
  signOutBtn: 'साइन आउट',
  welcomeTitle: 'डाक्टर (Dactor) नेपालमा स्वागत छ',
  welcomeSubtitle: 'नेपालका उत्कृष्ट क्लिनिक तथा विशेषज्ञ डाक्टरहरूसँग जोडिनुहोस्। प्रत्यक्ष लाम हेर्नुहोस् र स्वास्थ्य अलर्ट पाउनुहोस्।',
  instantAppointments: 'सहज क्लिनिक अपोइन्टमेन्ट',
  instantAppointmentsDesc: 'लामो लाइनबाट मुक्ति पाउनुहोस्। नेपालभरिका प्रमाणित डाक्टरहरू खोज्नुहोस् र पालो सुनिश्चित गर्नुहोस्।',
  liveQueue: 'प्रत्यक्ष लाम ट्र्याकिङ',
  liveQueueDesc: 'घरबाटै आफ्नो टोकन ट्र्याक गर्नुहोस्। पालो आउने समयमा मात्र क्लिनिक पुग्नुहोस्।',
  smartAlerts: 'स्मार्ट स्वास्थ्य सूचना',
  smartAlertsDesc: 'डाक्टर तयार हुँदा वा पालो अघि बढ्दा तत्काल प्राथमिकता सूचना पाउनुहोस्।',
  digitalReports: 'डिजिटल स्वास्थ्य विवरण',
  digitalReportsDesc: 'ल्याब रिपोर्ट, परामर्श रसिद र निदान रिपोर्टहरू फोनमा सुरक्षित हेर्नुहोस्।',
  signInGoogle: 'गुगल (Google) मार्फत साइन इन',
  continueGuest: 'अतिथि (Guest) को रूपमा जारी राख्नुहोस्',
  guestExplanation: 'अतिथि मोडमा तपाईं क्लिनिक खोज्न र कोडबाट लाम हेर्न सक्नुहुन्छ। अपोइन्टमेन्ट लिन भने साइन इन आवश्यक छ।',
  doctorIn: 'डाक्टर क्लिनिकभित्र',
  doctorOut: 'डाक्टर बाहिर',
  clinicBreak: 'क्लिनिक ब्रेकमा',
  callNext: 'पालो बोलाउनुहोस्',
  recall: 'पुनः बोलाउनुहोस्',
  markDone: 'सम्पन्न गर्नुहोस्',
  noShow: 'उपस्थित नभएको (No-Show)',
  settingsHeader: 'सेटिङ तथा प्राथमिकताहरू',
  appLanguageLabel: 'एपको भाषा (App Language)',
  appLanguageSub: 'नेपाली',
  changeLanguageBtn: 'परिवर्तन गर्नुहोस्'
}

const STORAGE_KEY = 'dactor_app_language'
const EVENT_KEY = 'dactor-language-changed'

export function getAppLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ne' || saved === 'en') return saved
  } catch {}
  return 'en'
}

export function hasChosenInitialLanguage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function setAppLanguage(lang: AppLanguage) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: lang }))
  } catch {}
}

export function toggleAppLanguage(): AppLanguage {
  const current = getAppLanguage()
  const next: AppLanguage = current === 'en' ? 'ne' : 'en'
  setAppLanguage(next)
  return next
}

interface LanguageContextType {
  language: AppLanguage
  setLanguage: (lang: AppLanguage) => void
  toggleLanguage: () => void
  strings: I18nStrings
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  toggleLanguage: () => {},
  strings: englishTranslations,
})

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(getAppLanguage)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
    const handleStorage = (e: Event) => {
      const customEvent = e as CustomEvent<AppLanguage>
      if (customEvent.detail && (customEvent.detail === 'en' || customEvent.detail === 'ne')) {
        setLanguageState(customEvent.detail)
      } else {
        setLanguageState(getAppLanguage())
      }
    }
    window.addEventListener(EVENT_KEY, handleStorage)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(EVENT_KEY, handleStorage)
      window.removeEventListener('storage', handleStorage)
    }
  }, [language])

  const setLanguage = (lang: AppLanguage) => {
    setAppLanguage(lang)
    setLanguageState(lang)
  }

  const toggleLanguage = () => {
    const next = language === 'en' ? 'ne' : 'en'
    setLanguage(next)
  }

  const strings = language === 'ne' ? nepaliTranslations : englishTranslations

  return React.createElement(
    LanguageContext.Provider,
    { value: { language, setLanguage, toggleLanguage, strings } },
    children
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context && context.setLanguage) {
    return context
  }

  // Fallback for standalone usage outside of provider
  const [lang, setLang] = useState<AppLanguage>(getAppLanguage)
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<AppLanguage>
      if (customEvent.detail && (customEvent.detail === 'en' || customEvent.detail === 'ne')) {
        setLang(customEvent.detail)
      } else {
        setLang(getAppLanguage())
      }
    }
    window.addEventListener(EVENT_KEY, handler)
    return () => window.removeEventListener(EVENT_KEY, handler)
  }, [])

  return {
    language: lang,
    setLanguage: (newLang: AppLanguage) => {
      setAppLanguage(newLang)
      setLang(newLang)
    },
    toggleLanguage: () => {
      const next = lang === 'en' ? 'ne' : 'en'
      setAppLanguage(next)
      setLang(next)
    },
    strings: lang === 'ne' ? nepaliTranslations : englishTranslations
  }
}
