import React, { useState, useEffect } from 'react';
import { Home, Trophy, Users, Target, Settings, LogOut, User, Menu, X, Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import logo from '../assets/logo.png';

export function Navigation({ currentView, onViewChange, tournament, isMobileOpen, onMobileClose }) {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const navItems = [
    { id: '/', label: t('navigation.dashboard'), icon: Home },
    { id: '/tournaments', label: t('navigation.tournaments'), icon: Trophy },
    // { id: '/players', label: t('navigation.players'), icon: Users },
    // { id: '/settings', label: t('navigation.settings'), icon: Settings }
  ];

  const handleSignOut = async () => {
    await signOut();
  };

  const handleNavItemClick = (itemId) => {
    onViewChange(itemId);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  // Build navigation classes based on device type
  const getNavigationClasses = () => {
    let classes = 'navigation';
    
    if (isMobile) {
      classes += ' mobile-overlay';
      if (isMobileOpen) {
        classes += ' open';
      }
    } else {
      if (isCollapsed) {
        classes += ' collapsed';
      }
    }
    
    return classes;
  };

  return (
    <nav className={getNavigationClasses()}>
      <div className="nav-header">
        <div className="nav-logo">
          <img
            src={logo}
            alt="DartLead"
            className="nav-logo-image"
          />
          {!isCollapsed && <span>DartLead</span>}
        </div>
        {!isMobile && (
          <button 
            className="collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        )}
      </div>
      
      {tournament && (!isCollapsed || isMobile) && (
        <div className="current-tournament">
          <Trophy size={14} />
          <span>{tournament.name}</span>
        </div>
      )}
      
      <div className="nav-items">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => handleNavItemClick(item.id)}
              title={isCollapsed ? item.label : ''}
            >
              <Icon size={18} />
              {(!isCollapsed || isMobile) && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>
      
      <div className="nav-footer">
        {user ? (
          <>
            <div className="user-info">
              <User size={16} />
              {(!isCollapsed || isMobile) && (
                <div className="user-details">
                  <span className="user-name">{user?.user_metadata?.full_name || user?.email || 'User'}</span>
                  <span className="user-role">{t('navigation.adminScorer')}</span>
                </div>
              )}
            </div>
            <div className="language-section">
              <LanguageSwitcher />
            </div>
            
            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme}
              title={isCollapsed ? (isDarkMode ? t('navigation.lightMode') : t('navigation.darkMode')) : ''}
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              {(!isCollapsed || isMobile) && <span>{isDarkMode ? t('navigation.lightMode') : t('navigation.darkMode')}</span>}
            </button>
            
            <button 
              className="logout-btn" 
              onClick={handleSignOut}
              title={isCollapsed ? t('navigation.logout') : ''}
            >
              <LogOut size={16} />
              {(!isCollapsed || isMobile) && <span>{t('navigation.logout')}</span>}
            </button>
          </>
        ) : (
          <>
            <div className="language-section">
              <LanguageSwitcher />
            </div>
            
            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme}
              title={isCollapsed ? (isDarkMode ? t('navigation.lightMode') : t('navigation.darkMode')) : ''}
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              {(!isCollapsed || isMobile) && <span>{isDarkMode ? t('navigation.lightMode') : t('navigation.darkMode')}</span>}
            </button>
            
            <button 
              className="login-btn" 
              onClick={() => onViewChange('/login')}
              title={isCollapsed ? t('navigation.login') : ''}
            >
              <User size={16} />
              {(!isCollapsed || isMobile) && <span>{t('navigation.login')}</span>}
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
