import React, { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useAssistant } from '@/contexts/AssistantContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

// Shown instead of the panel when its download fails (e.g. a tab still on old files after a deploy).
function AssistantUnavailable({ isOpen, onOpenChange }) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!isOpen) return;
    toast.error(t('assistant.unavailable'));
    onOpenChange(false);
  }, [isOpen, onOpenChange, t]);
  return null;
}

// The panel (markdown, syntax highlighting) downloads on first open, so nobody else pays for it.
// A failed download must not take the whole app down through the top-level error boundary.
const AssistantPanel = lazy(() => import('./AssistantPanel')
  .then(m => ({ default: m.AssistantPanel }))
  .catch((error) => {
    console.error('Error loading the assistant:', error);
    return { default: AssistantUnavailable };
  }));

export function AssistantChat() {
  const { canUseAssistant, hasOpened, isOpen, setIsOpen, openAssistant } = useAssistant();
  const location = useLocation();
  const { t } = useLanguage();

  if (!canUseAssistant) return null;
  // Never over the scoring keypad.
  const isHidden = location.pathname.startsWith('/match/');

  return (
    <>
      {/* Below lg the mobile header has this button: nothing floats over the page on a phone. */}
      {!isHidden && (
        <Button
          size="icon"
          className="fixed right-4 bottom-[calc(1rem+var(--safe-area-inset-bottom,0px))] z-40 hidden size-12 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 animate-in fade-in zoom-in-75 duration-300 lg:inline-flex"
          aria-label={t('assistant.open')}
          onClick={openAssistant}
        >
          <MessageCircle className="size-5" />
        </Button>
      )}
      {hasOpened && (
        <Suspense fallback={null}>
          <AssistantPanel isOpen={isOpen && !isHidden} onOpenChange={setIsOpen} />
        </Suspense>
      )}
    </>
  );
}
