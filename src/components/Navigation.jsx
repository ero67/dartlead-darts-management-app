import React, { useState, useEffect } from 'react';
import { Home, Trophy, Users, Target, Settings, LogOut, User, Menu, X, Moon, Sun, Shield, Crown, Badge, Monitor } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useAdmin } from '../contexts/AdminContext';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { DeviceSettings } from './DeviceSettings';
import logo from '../assets/logo.png';

export function Navigation({ currentView, onViewChange, tournament, isMobileOpen, onMobileClose }) {
  const { user, signOut } = useAuth();
  const { isAdmin, isManager } = useAdmin();
  const { deviceName, boardNumber } = useLiveMatch();
  const { t } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

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
    { id: '/', label: t('navigation.home'), icon: Home },
    { id: '/dashboard', label: t('navigation.dashboard'), icon: Trophy },
    { id: '/tournaments', label: t('navigation.tournaments'), icon: Users },
    { id: '/leagues', label: t('navigation.leagues'), icon: Crown },
    // { id: '/privacy', label: 'Privacy', icon: Shield },
    // { id: '/players', label: t('navigation.players'), icon: Users },
    // { id: '/settings', label: t('navigation.settings'), icon: Settings }
  ];

  const handleSignOut = async () => {
    if (onMobileClose) onMobileClose();
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
            title={isCollapsed ? t('navigation.expandSidebar') : t('navigation.collapseSidebar')}
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
        {isAdmin && (
          <button
            className={`nav-item ${currentView === '/admin' ? 'active' : ''}`}
            onClick={() => handleNavItemClick('/admin')}
            title={isCollapsed ? t('navigation.adminPanel') : ''}
          >
            <Crown size={18} />
            {(!isCollapsed || isMobile) && <span>{t('navigation.adminPanel')}</span>}
          </button>
        )}
      </div>
      
      <div className="nav-footer">
        <button
          className="nav-item"
          onClick={() => handleNavItemClick('/privacy')}
          title={isCollapsed ? t('navigation.privacy') : ''}
        >
          <Shield size={16} />
          {(!isCollapsed || isMobile) && <span>{t('navigation.privacy')}</span>}
        </button>
        {user ? (
          <>
            <div className="user-info">
              <User size={16} />
              {(!isCollapsed || isMobile) && (
                <div className="user-details">
                  <div className="user-name-row">
                  <span className="user-name">{user?.user_metadata?.full_name || user?.email || 'User'}</span>
                    {isAdmin && (
                      <Crown 
                        size={14} 
                        className="admin-icon" 
                        title="Administrator"
                      />
                    )}
                    {!isAdmin && isManager && (
                      <Badge 
                        size={14} 
                        className="manager-icon" 
                        title="Manager"
                      />
                    )}
                  </div>
                </div>
              )}
              {isCollapsed && isAdmin && (
                <Crown 
                  size={14} 
                  className="admin-icon" 
                  title="Administrator"
                />
              )}
              {isCollapsed && !isAdmin && isManager && (
                <Badge 
                  size={14} 
                  className="manager-icon" 
                  title="Manager"
                />
              )}
            </div>
            <button 
              className="device-settings-btn" 
              onClick={() => { setShowDeviceSettings(true); if (onMobileClose) onMobileClose(); }}
              title={isCollapsed ? t('deviceSettings.title', 'Nastavenia zariadenia') : ''}
            >
              <Monitor size={16} />
              {(!isCollapsed || isMobile) && (
                <>
                  {boardNumber ? (
                    <span className="board-number">
                      <Target size={12} />
                      {boardNumber}
                    </span>
                  ) : (
                    <span>{t('deviceSettings.title', 'Zariadenie')}</span>
                  )}
                </>
              )}
              {isCollapsed && boardNumber && (
                <span className="board-number">
                  <Target size={10} />
                  {boardNumber}
                </span>
              )}
            </button>

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
            <button 
              className="device-settings-btn" 
              onClick={() => { setShowDeviceSettings(true); if (onMobileClose) onMobileClose(); }}
              title={isCollapsed ? t('deviceSettings.title', 'Nastavenia zariadenia') : ''}
            >
              <Monitor size={16} />
              {(!isCollapsed || isMobile) && (
                <>
                  {boardNumber ? (
                    <span className="board-number">
                      <Target size={12} />
                      {boardNumber}
                    </span>
                  ) : (
                    <span>{t('deviceSettings.title', 'Zariadenie')}</span>
                  )}
                </>
              )}
            </button>

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
              onClick={() => { onViewChange('/login'); if (onMobileClose) onMobileClose(); }}
              title={isCollapsed ? t('navigation.login') : ''}
            >
              <User size={16} />
              {(!isCollapsed || isMobile) && <span>{t('navigation.login')}</span>}
            </button>
          </>
        )}
      </div>

      {/* Device Settings Modal */}
      <DeviceSettings 
        isOpen={showDeviceSettings} 
        onClose={() => setShowDeviceSettings(false)} 
      />
    </nav>
  );
}
