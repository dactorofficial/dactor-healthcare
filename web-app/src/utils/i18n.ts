import React, { useState, useEffect, createContext, useContext } from 'react'

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

  // Common
  search: string
  close: string
  back: string
  save: string
  cancel: string
  edit: string
  delete: string
  confirm: string
  loading: string
  refresh: string
  retry: string
  resetFilters: string
  viewAll: string
  rsPrefix: string
  inClinic: string
  away: string
  verified: string

  // Navigation
  navHome: string
  navRecords: string
  navAppointments: string
  navProfile: string
  navClinics: string
  navTracker: string
  navLabReports: string
  navAverageTime: string
  track10DigitCode: string
  clinicCenter: string
  doctorDesk: string
  patientPortal: string
  myHealth: string
  trackLiveQueue: string
  searchPlaceholder: string
  sortFilter: string
  sortInClinicFirst: string
  sortFeeLowHigh: string
  tabAll: string
  tabDoctors: string
  tabClinics: string
  signOut: string
  mainSite: string
  brandTagline: string

  // Home Page
  selectLocation: string
  allNepal: string
  selectCityRegion: string
  allProviders: string
  specialistDoctors: string
  clinicsAndLabs: string
  featuredDoctors: string
  doctorsAvailable: string
  sortLabel: string
  sortRecommended: string
  sortInside: string
  sortLowFee: string
  sortName: string
  noDoctorsFound: string
  noClinicsFound: string
  bookAppointment: string
  nextAvailable: string
  viewDetails: string
  yrsExp: string

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

  // Portal Desk & Operations
  doctorIn: string
  doctorOut: string
  clinicBreak: string
  callNext: string
  recall: string
  markDone: string
  noShow: string
}

export const englishTranslations: I18nStrings = {
  chooseLanguageTitle: 'Choose Your Language',
  chooseLanguageSubtitle: 'Select your preferred language to continue',
  languageEnglish: 'English',
  languageNepali: 'नेपाली (Nepali)',
  confirmAndContinue: 'Confirm & Continue',
  changeLaterHint: 'You can change this anytime from Settings or the top header',
  changeLanguageTitle: 'Change Language',
  applyBtn: 'Apply',
  cancelBtn: 'Cancel',

  search: 'Search',
  close: 'Close',
  back: 'Back',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  confirm: 'Confirm',
  loading: 'Loading...',
  refresh: 'Refresh',
  retry: 'Retry',
  resetFilters: 'Reset Filters',
  viewAll: 'View All',
  rsPrefix: 'Rs.',
  inClinic: 'In Clinic',
  away: 'Away',
  verified: 'Verified',

  navHome: 'Home',
  navRecords: 'Records',
  navAppointments: 'Appointments',
  navProfile: 'Profile',
  navClinics: 'Find Clinics',
  navTracker: 'Track / Queue',
  navLabReports: 'Lab Reports',
  navAverageTime: 'Wait Times',
  track10DigitCode: 'Track 10-Digit Code',
  clinicCenter: 'Clinic Center',
  doctorDesk: 'Doctor Desk',
  patientPortal: 'Patient Portal',
  myHealth: 'My Health',
  trackLiveQueue: 'Track Live Queue',
  searchPlaceholder: 'Search skin, heart, child, clinic or doctor...',
  sortFilter: 'Sort',
  sortInClinicFirst: '🟢 Doctor In Clinic First',
  sortFeeLowHigh: 'Lowest Fee First',
  tabAll: 'All Providers',
  tabDoctors: 'Specialist Doctors',
  tabClinics: 'Clinics & Labs',
  signOut: 'Logout',
  mainSite: 'Main Site',
  brandTagline: 'Nepal OPD Queue & Healthcare Ecosystem',

  selectLocation: 'Select Location',
  allNepal: 'All Nepal',
  selectCityRegion: 'Select City / Region',
  allProviders: 'All Providers',
  specialistDoctors: 'Specialist Doctors',
  clinicsAndLabs: 'Clinics & Labs',
  featuredDoctors: 'Featured Specialist Doctors',
  doctorsAvailable: 'verified doctors available in',
  sortLabel: 'Sort',
  sortRecommended: 'Recommended',
  sortInside: 'Inside Clinic',
  sortLowFee: 'Lowest Fee',
  sortName: 'A-Z',
  noDoctorsFound: 'No doctors found matching criteria',
  noClinicsFound: 'No clinics found matching criteria',
  bookAppointment: 'Book Appointment',
  nextAvailable: 'Next Available',
  viewDetails: 'View Details',
  yrsExp: 'Yrs Exp',

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
  guestExplanation: 'In Guest Mode, you can search clinics, explore doctors, and track live queues with code. Sign-in is only required to book an appointment.',

  doctorIn: 'Doctor In',
  doctorOut: 'Doctor Out',
  clinicBreak: 'Clinic On Break',
  callNext: 'Call Next',
  recall: 'Recall',
  markDone: 'Mark Done',
  noShow: 'No-Show'
}

export const nepaliTranslations: I18nStrings = {
  chooseLanguageTitle: 'भाषा चयन गर्नुहोस्',
  chooseLanguageSubtitle: 'अगाडि बढ्नको लागि आफ्नो मनपर्ने भाषा छान्नुहोस्',
  languageEnglish: 'English',
  languageNepali: 'नेपाली (Nepali)',
  confirmAndContinue: 'पुष्टि गरी अगाडि बढ्नुहोस्',
  changeLaterHint: 'तपाईंले यसलाई माथिल्लो मेनु वा सेटिङबाट जुनसुकै बेला परिवर्तन गर्न सक्नुहुन्छ',
  changeLanguageTitle: 'भाषा परिवर्तन गर्नुहोस्',
  applyBtn: 'लागू गर्नुहोस्',
  cancelBtn: 'रद्द गर्नुहोस्',

  search: 'खोज्नुहोस्',
  close: 'बन्द गर्नुहोस्',
  back: 'पछाडि',
  save: 'सुरक्षित गर्नुहोस्',
  cancel: 'रद्द गर्नुहोस्',
  edit: 'सम्पादन',
  delete: 'हटाउनुहोस्',
  confirm: 'पुष्टि गर्नुहोस्',
  loading: 'लोड हुँदैछ...',
  refresh: 'ताजा गर्नुहोस्',
  retry: 'पुनः प्रयास',
  resetFilters: 'फिल्टर रिसेट',
  viewAll: 'सबै हेर्नुहोस्',
  rsPrefix: 'रु.',
  inClinic: 'क्लिनिकमा उपलब्ध',
  away: 'बाहिर',
  verified: 'प्रमाणित',

  navHome: 'गृहपृष्ठ',
  navRecords: 'रेकर्डहरू',
  navAppointments: 'अपोइन्टमेन्टहरू',
  navProfile: 'प्रोफाइल',
  navClinics: 'क्लिनिक खोज्नुहोस्',
  navTracker: 'ट्र्याक / लाम',
  navLabReports: 'ल्याब रिपोर्ट',
  navAverageTime: 'प्रतीक्षा समय',
  track10DigitCode: '१०-अङ्के कोड ट्र्याक',
  clinicCenter: 'क्लिनिक केन्द्र',
  doctorDesk: 'डाक्टर डेस्क',
  patientPortal: 'बिरामी पोर्टल',
  myHealth: 'मेरो स्वास्थ्य',
  trackLiveQueue: 'लाइभ लाम ट्र्याक गर्नुहोस्',
  searchPlaceholder: 'छाला, मुटु, बालबालिका, क्लिनिक वा डाक्टर खोज्नुहोस्...',
  sortFilter: 'क्रमबद्ध',
  sortInClinicFirst: '🟢 क्लिनिकमा उपस्थित डाक्टर पहिले',
  sortFeeLowHigh: 'कम शुल्क पहिले',
  tabAll: 'सबै स्वास्थ्य सेवा',
  tabDoctors: 'विशेषज्ञ डाक्टरहरू',
  tabClinics: 'क्लिनिक तथा ल्याब',
  signOut: 'साइन आउट',
  mainSite: 'मुख्य साइट',
  brandTagline: 'नेपाल ओपीडी लाम तथा स्वास्थ्य सेवा इकोसिस्टम',

  selectLocation: 'स्थान चयन गर्नुहोस्',
  allNepal: 'सबै नेपाल',
  selectCityRegion: 'शहर वा क्षेत्र चयन गर्नुहोस्',
  allProviders: 'सबै प्रदायकहरू',
  specialistDoctors: 'विशेषज्ञ डाक्टरहरू',
  clinicsAndLabs: 'क्लिनिक तथा ल्याबहरू',
  featuredDoctors: 'उत्कृष्ट विशेषज्ञ डाक्टरहरू',
  doctorsAvailable: 'प्रमाणित डाक्टरहरू उपलब्ध:',
  sortLabel: 'क्रमबद्ध',
  sortRecommended: 'सिफारिस गरिएको',
  sortInside: 'क्लिनिकमा उपलब्ध',
  sortLowFee: 'न्यूनतम शुल्क',
  sortName: 'A-Z नाम',
  noDoctorsFound: 'कुनै विशेषज्ञ डाक्टर फेला परेन',
  noClinicsFound: 'कुनै क्लिनिक फेला परेन',
  bookAppointment: 'अपोइन्टमेन्ट लिनुहोस्',
  nextAvailable: 'अर्को उपलब्ध मिति',
  viewDetails: 'विवरण हेर्नुहोस्',
  yrsExp: 'वर्ष अनुभव',

  settingsHeader: 'सेटिङ र खाता प्राथमिकताहरू',
  appLanguageLabel: 'एपको भाषा (Language)',
  appLanguageSub: 'नेपाली',
  changeLanguageBtn: 'परिवर्तन गर्नुहोस्',
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
  guestExplanation: 'पाहुना मोडमा तपाईं क्लिनिक र डाक्टर खोज्न र कोडबाट प्रत्यक्ष लाम ट्र्याक गर्न सक्नुहुन्छ। अपोइन्टमेन्ट लिन मात्र साइन इन आवश्यक पर्छ।',

  doctorIn: 'डाक्टर कक्षमा',
  doctorOut: 'डाक्टर बाहिर',
  clinicBreak: 'क्लिनिक ब्रेकमा',
  callNext: 'पालो बोलाउनुहोस्',
  recall: 'पुनः बोलाउनुहोस्',
  markDone: 'सम्पन्न भयो',
  noShow: 'उपस्थित नभएको'
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
