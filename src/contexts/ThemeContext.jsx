import React, { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Get initial theme from localStorage or default to light
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      return saved === 'dark';
    }
    // Check system preference if no saved preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    } else {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    }
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');

    // Native shell: Android 15+ draws the app under a transparent status bar,
    // so its colour is simply our page background (see the safe-area padding
    // on .app). Only the icon style has to be told which theme we are on.
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light }).catch(() => {});
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const value = {
    isDarkMode,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook to use theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

