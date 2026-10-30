import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAdmin } from './AdminContext';
import { useAuth } from './AuthContext.jsx';
import { ASSISTANT_URL, assistantService } from '../services/assistantService';

const AssistantContext = createContext();

// Who may use the assistant and whether its panel is open, shared by the floating button and the mobile header.
export function AssistantProvider({ children }) {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [isOpen, setIsOpen] = useState(false);
  // Stays mounted after the first open, so closing the panel keeps the conversation.
  const [hasOpened, setHasOpened] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (ASSISTANT_URL && user) assistantService.getSettings().then(setSettings);
  }, [user]);

  // Behind a flag (VITE_ASSISTANT_URL), for signed-in users the admin switch allows (everyone or admins
  // only; the API checks the same).
  const canUseAssistant = Boolean(ASSISTANT_URL && user && settings && (settings.audience === 'everyone' || isAdmin));

  const openAssistant = () => {
    setHasOpened(true);
    setIsOpen(true);
  };

  return (
    <AssistantContext.Provider value={{ canUseAssistant, hasOpened, isOpen, setIsOpen, openAssistant }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error('useAssistant must be used within an AssistantProvider');
  return context;
}
