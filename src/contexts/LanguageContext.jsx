import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import sk from '../locales/sk.json';

const LanguageContext = createContext();

const translations = {
  en,
  sk
};

export function LanguageProvider({ children }) {
  // Get initial language from localStorage or default to Slovak
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language');
    return saved || 'sk';
  });

  // Save language preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
  }, [language]);

  // Helper function to get nested translation
  const t = (key, params = {}) => {
    const keys = key.split('.');
    let value = translations[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Fallback to English if translation not found
        value = translations.en;
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object') {
            value = value[fallbackKey];
          } else {
            return key; // Return key if translation not found
          }
        }
        break;
      }
    }
    
    // Handle interpolation - replace {{key}} with params[key]
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      Object.keys(params).forEach(paramKey => {
        value = value.replace(new RegExp(`{{${paramKey}}}`, 'g'), params[paramKey]);
      });
    }
    
    return value || key;
  };

  const changeLanguage = (lang) => {
    if (translations[lang]) {
      setLanguage(lang);
    }
  };

  const value = {
    language,
    changeLanguage,
    t
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook to use language context
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
