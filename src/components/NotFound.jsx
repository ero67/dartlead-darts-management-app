import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';

export function NotFound() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="tw min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-4 p-6 text-center text-foreground">
      <p className="text-7xl font-bold tracking-tight tabular-nums text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t('notFound.title')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('notFound.message')}</p>
      <Button onClick={() => navigate('/dashboard')}>
        {t('notFound.goHome')}
      </Button>
    </div>
  );
}
