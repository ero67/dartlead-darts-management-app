import React from 'react';
import { Globe, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGES } from '../lib/languages';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// Standalone language menu (the sidebar has its own inline copy of this).
export function LanguageSwitcher() {
  const { language, changeLanguage } = useLanguage();
  const current = LANGUAGES.find(l => l.code === language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="tw">
          <Globe />
          {current?.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tw min-w-40">
        {LANGUAGES.map(lang => (
          <DropdownMenuItem key={lang.code} onClick={() => changeLanguage(lang.code)}>
            <span className="flex-1">{lang.name}</span>
            {lang.code === language && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
