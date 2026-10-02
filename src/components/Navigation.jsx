import React, { useState } from 'react';
import { Home, Trophy, Users, Target, LogOut, User, Moon, Sun, Shield, Crown, Badge as BadgeIcon, Monitor, Globe, ChevronsUpDown, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useAdmin } from '../contexts/AdminContext';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGES } from '../lib/languages';
import { useTheme } from '../contexts/ThemeContext';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeviceSettings } from './DeviceSettings';
import logoIcon from '../assets/logo-icon.png';
import { getUserDisplayName, getUserInitials } from '../utils/userDisplayName';

export function Navigation({ currentView, onViewChange, tournament }) {
  const { user, signOut } = useAuth();
  const { isAdmin, isManager, canManage } = useAdmin();
  const { boardNumber } = useLiveMatch();
  const { t, language, changeLanguage } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  const groups = [
    {
      label: t('navigation.home'),
      items: [
        { id: '/', label: t('navigation.home'), icon: Home },
        { id: '/practice', label: t('navigation.practice'), icon: Target },
      ],
    },
    {
      label: t('navigation.tournaments'),
      items: [
        { id: '/dashboard', label: canManage ? t('dashboard.myDashboard') : t('navigation.dashboard'), icon: Trophy },
        { id: '/tournaments', label: t('navigation.tournaments'), icon: Users },
        { id: '/leagues', label: t('navigation.leagues'), icon: Crown },
      ],
    },
    ...((canManage || isAdmin) ? [{
      label: t('navigation.managerPanel'),
      items: [
        ...(canManage ? [{ id: '/manager', label: t('navigation.managerPanel'), icon: BadgeIcon }] : []),
        ...(isAdmin ? [{ id: '/admin', label: t('navigation.adminPanel'), icon: Shield }] : []),
      ],
    }] : []),
  ];

  const go = (view) => {
    onViewChange(view);
    setOpenMobile(false);
  };

  const handleSignOut = async () => {
    setOpenMobile(false);
    await signOut();
  };

  const openDeviceSettings = () => {
    setShowDeviceSettings(true);
    setOpenMobile(false);
  };

  const displayName = user ? (getUserDisplayName(user) || user?.email || t('common.user')) : '';
  const roleLabel = isAdmin ? t('common.roleAdmin') : (isManager ? t('common.roleManager') : null);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img src={logoIcon} alt="DartLead" className="size-8 shrink-0 rounded-lg object-cover" />
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold leading-tight">DartLead</span>
            {tournament && (
              <span className="truncate text-xs text-muted-foreground" title={tournament.name}>{tournament.name}</span>
            )}
          </div>
          <SidebarTrigger className="hidden group-data-[collapsible=icon]:hidden lg:flex" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = currentView === item.id;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton isActive={active} tooltip={item.label} onClick={() => go(item.id)}>
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t('deviceSettings.title')} onClick={openDeviceSettings}>
              <Monitor />
              <span>{t('deviceSettings.title')}</span>
            </SidebarMenuButton>
            {boardNumber && <SidebarMenuBadge className="tabular-nums">{t('deviceSettings.board', 'Board')} {boardNumber}</SidebarMenuBadge>}
          </SidebarMenuItem>

          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip={LANGUAGES.find(l => l.code === language)?.name}>
                  <Globe />
                  <span>{LANGUAGES.find(l => l.code === language)?.name}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-40">
                {LANGUAGES.map((lang) => (
                  <DropdownMenuItem key={lang.code} onClick={() => changeLanguage(lang.code)}>
                    <span className="flex-1">{lang.name}</span>
                    {lang.code === language && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton tooltip={isDarkMode ? t('navigation.lightMode') : t('navigation.darkMode')} onClick={toggleTheme}>
              {isDarkMode ? <Sun /> : <Moon />}
              <span>{isDarkMode ? t('navigation.lightMode') : t('navigation.darkMode')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t('navigation.privacy')} isActive={currentView === '/privacy'} onClick={() => go('/privacy')} className="text-muted-foreground">
              <Shield />
              <span>{t('navigation.privacy')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" tooltip={displayName} className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg text-xs font-semibold">{getUserInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{displayName}</span>
                      {roleLabel && <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>}
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-56">
                  <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                    <span className="truncate">{displayName}</span>
                    {roleLabel && <Badge variant="secondary">{roleLabel}</Badge>}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => go('/my-profile')}>
                    <User />
                    {t('navigation.myProfile')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                    <LogOut />
                    {t('navigation.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton
                tooltip={t('navigation.login')}
                onClick={() => go('/login')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              >
                <User />
                <span>{t('navigation.login')}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

      <DeviceSettings isOpen={showDeviceSettings} onClose={() => setShowDeviceSettings(false)} />
    </Sidebar>
  );
}
