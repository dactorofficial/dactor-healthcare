import React, { useState } from 'react'
import { Globe, CheckCircle, Circle, X } from 'lucide-react'
import { AppLanguage, useLanguage } from '../utils/i18n'

interface LanguageSelectionModalProps {
  isOpen: boolean
  isFirstVisit?: boolean
  onClose: () => void
  onConfirm?: (lang: AppLanguage) => void
}

export const LanguageSelectionModal: React.FC<LanguageSelectionModalProps> = ({
  isOpen,
  isFirstVisit = false,
  onClose,
  onConfirm
}) => {
  const { language: currentLang, setLanguage, strings } = useLanguage()
  const [selected, setSelected] = useState<AppLanguage>(currentLang)

  if (!isOpen) return null

  const handleApply = () => {
    setLanguage(selected)
    onConfirm?.(selected)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-5">
        {!isFirstVisit && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header Icon */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Globe className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              {isFirstVisit ? strings.chooseLanguageTitle : strings.changeLanguageTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isFirstVisit ? strings.chooseLanguageSubtitle : 'Select your preferred language'}
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* English */}
          <div
            onClick={() => setSelected('en')}
            className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer border-2 transition-all ${
              selected === 'en'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-transparent'
            }`}
          >
            <div className="flex items-center space-x-3.5">
              <span className="text-2xl">🇬🇧</span>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">English</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    English
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Continue in English</p>
              </div>
            </div>
            {selected === 'en' ? (
              <CheckCircle className="w-5 h-5 text-blue-600" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            )}
          </div>

          {/* Nepali */}
          <div
            onClick={() => setSelected('ne')}
            className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer border-2 transition-all ${
              selected === 'ne'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-transparent'
            }`}
          >
            <div className="flex items-center space-x-3.5">
              <span className="text-2xl">🇳🇵</span>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">नेपाली</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Nepali
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">नेपालीमा प्रयोग गर्नुहोस्</p>
              </div>
            </div>
            {selected === 'ne' ? (
              <CheckCircle className="w-5 h-5 text-blue-600" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            )}
          </div>
        </div>

        {isFirstVisit && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center text-[11px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            ℹ️ {strings.changeLaterHint}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          {isFirstVisit ? (
            <button
              onClick={handleApply}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition shadow-md hover:shadow-lg active:scale-95"
            >
              {strings.confirmAndContinue}
            </button>
          ) : (
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {strings.cancelBtn}
              </button>
              <button
                onClick={handleApply}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition shadow-sm active:scale-95"
              >
                {strings.applyBtn}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
