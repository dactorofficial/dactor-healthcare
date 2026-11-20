import { useState, useEffect } from 'react'

export type AppLanguage = 'en' | 'ne'

export interface I18nStrings {
  // Dialog & Selection
  chooseLanguageTitle: string
  chooseLanguageSubtitle: string
  languageEnglish: string
  languageNepali: string
  confirmAndContinue: string
  changeLaterHint: string
  changeLanguageTitle: string
  applyBtn: string
  cancelBtn: string

  // Navigation
  navHome: string
  navRecords: string
  navAppointments: string
  navProfile: string
  navClinics: string
  navTracker: string
  navLabReports: string

  // Settings & Account
  settingsHeader: string
  appLanguageLabel: string
  appLanguageSub: string
  changeLanguageBtn: string
  editProfileTitle: string
  editProfileSub: string
  pushNotifTitle: string
  pushNotifSub: string
  clearCacheTitle: string
  clearCacheSub: string
  txHistoryTitle: string
  txHistorySub: string
  termsPolicyTitle: string
  termsPolicySub: string
  signOutBtn: string

  // Onboarding & Marketing
  welcomeTitle: string
  welcomeSubtitle: string
  instantAppointments: string
  instantAppointmentsDesc: string
  liveQueue: string
  liveQueueDesc: string
  smartAlerts: string
  smartAlertsDesc: string
  digitalReports: string
  digitalReportsDesc: string
  signInGoogle: string
  continueGuest: string
  guestExplanation: string
}

export const englishTranslations: I18nStrings = {
  chooseLanguageTitle: 'Choose Your Language',
  chooseLanguageSubtitle: 'Select your preferred language to continue',
  languageEnglish: 'English',
  languageNepali: 'नेपाली (Nepali)',
  confirmAndContinue: 'Confirm & Continue',
  changeLaterHint: 'You can change this anytime from Settings',
  changeLanguageTitle: 'Change Language',
  applyBtn: 'Apply',
  cancelBtn: 'Cancel',

  navHome: 'Home',
  navRecords: 'Records',
  navAppointments: 'Appointments',
  navProfile: 'Profile',
  navClinics: 'Clinics',
  navTracker: 'Live Tracker',
  navLabReports: 'Lab Reports',

  settingsHeader: 'Settings & Account Preferences',
  appLanguageLabel: 'App Language',
  appLanguageSub: 'English',
  changeLanguageBtn: 'Change',
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
  guestExplanation: 'In Guest Mode, you can search clinics, explore doctors, and track live queues with code. Sign-in is only required to book an appointment.'
}

export const nepaliTranslations: I18nStrings = {
  chooseLanguageTitle: 'भाषा चयन गर्नुहोस्',
  chooseLanguageSubtitle: 'अगाडि बढ्नको लागि आफ्नो मनपर्ने भाषा छान्नुहोस्',
  languageEnglish: 'English',
  languageNepali: 'नेपाली (Nepali)',
  confirmAndContinue: 'पुष्टि गरी अगाडि बढ्नुहोस्',
  changeLaterHint: 'तपाईंले यसलाई पछि सेटिङबाट जुनसुकै बेला परिवर्तन गर्न सक्नुहुन्छ',
  changeLanguageTitle: 'भाषा परिवर्तन गर्नुहोस्',
  applyBtn: 'लागू गर्नुहोस्',
  cancelBtn: 'रद्द गर्नुहोस्',

  navHome: 'होम',
  navRecords: 'रेकर्डहरू',
  navAppointments: 'अपोइन्टमेन्टहरू',
  navProfile: 'प्रोफाइल',
  navClinics: 'क्लिनिकहरू',
  navTracker: 'प्रत्यक्ष ट्र्याकर',
  navLabReports: 'ल्याब रिपोर्ट',

  settingsHeader: 'सेटिङ र खाता प्राथमिकताहरू',
  appLanguageLabel: 'एपको भाषा',
  appLanguageSub: 'नेपाली',
  changeLanguageBtn: 'परिवर्तन',
  editProfileTitle: 'प्रोफाइल सम्पादन गर्नुहोस्',
  editProfileSub: 'नाम, फोन, उमेर, लिङ्ग',
  pushNotifTitle: 'पुश सूचनाहरू (FCM)',
  pushNotifSub: 'प्रत्यक्ष लाम अलर्ट तथा सूचना',
  clearCacheTitle: 'सुरक्षित इतिहास खाली गर्नुहोस्',
  clearCacheSub: 'यस डिभाइसमा रहेका स्थानीय कोडहरू हटाउनुहोस्',
  txHistoryTitle: 'कारोबार इतिहास',
  txHistorySub: 'सबै अपोइन्टमेन्ट भुक्तानी र विवरणहरू',
  termsPolicyTitle: 'सर्तहरू र गोपनीयता नीति',
  termsPolicySub: 'आधिकारिक बिरामी गोपनीयता तथा कानुनी सर्त',
  signOutBtn: 'साइन आउट',

  welcomeTitle: 'डाक्टर नेपालमा स्वागत छ',
  welcomeSubtitle: 'शीर्ष प्रमाणित मेडिकल क्लिनिक र विशेषज्ञ डाक्टरहरूसँग जोडिनुहोस्। प्रत्यक्ष लाम ट्र्याक गर्नुहोस् र तत्काल स्वास्थ्य सूचनाहरू पाउनुहोस्।',
  instantAppointments: 'तुरुन्त क्लिनिक अपोइन्टमेन्ट',
  instantAppointmentsDesc: 'लामो लाइनमा उभिनु पर्दैन। नेपालभरिका प्रमाणित विशेषज्ञ डाक्टर र क्लिनिकहरू हेर्नुहोस् र आफ्नो पालो सुरक्षित गर्नुहोस्।',
  liveQueue: 'प्रत्यक्ष लाम ट्र्याकिङ',
  liveQueueDesc: 'घरमै बसी आफ्नो ओपीडी पालो प्रत्यक्ष ट्र्याक गर्नुहोस्। अनावश्यक प्रतीक्षा नगरी आफ्नो पालो आउँदा मात्र क्लिनिक पुग्नुहोस्।',
  smartAlerts: 'स्मार्ट स्वास्थ्य सूचना',
  smartAlertsDesc: 'तपाईंको पालो आउन लाग्दा वा डाक्टर क्लिनिकमा उपलब्ध हुँदा तुरुन्तै मोबाइलमा प्रत्यक्ष सूचना पाउनुहोस्।',
  digitalReports: 'डिजिटल स्वास्थ्य रेकर्ड',
  digitalReportsDesc: 'आफ्ना सबै ल्याब रिपोर्ट, प्रेस्क्रिप्सन र बिलहरू सुरक्षित रूपमा मोबाइलमै प्राप्त र डाउनलोड गर्नुहोस्।',
  signInGoogle: 'गुगलबाट साइन इन गर्नुहोस्',
  continueGuest: 'पाहुनाको रूपमा जारी राख्नुहोस्',
  guestExplanation: 'पाहुना मोडमा तपाईं क्लिनिक र डाक्टर खोज्न र कोडबाट प्रत्यक्ष लाम ट्र्याक गर्न सक्नुहुन्छ। अपोइन्टमेन्ट लिन मात्र साइन इन आवश्यक पर्छ।'
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
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: lang }))
  } catch {}
}

export function useLanguage() {
  const [language, setLanguageState] = useState<AppLanguage>(getAppLanguage)

  useEffect(() => {
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
  }, [])

  const setLanguage = (lang: AppLanguage) => {
    setAppLanguage(lang)
    setLanguageState(lang)
  }

  const strings = language === 'ne' ? nepaliTranslations : englishTranslations

  return {
    language,
    setLanguage,
    strings
  }
}
