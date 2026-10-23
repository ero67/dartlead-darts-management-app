import React from 'react';
import { Info } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// The "MPR" label as a tap target that explains it (a popover, not a
// tooltip, so it works on touch screens).
export function MprInfo({ className }) {
  const { t } = useLanguage();
  return (
    <Popover>
      <PopoverTrigger
        className={cn('inline-flex items-center gap-0.5 rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring', className)}
      >
        {t('common.mpr')}
        <Info className="size-3 shrink-0 opacity-70" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent collisionPadding={12} className="text-left font-normal normal-case tracking-normal">
        <PopoverHeader>
          <PopoverTitle>{t('common.mprInfo.title')}</PopoverTitle>
          <PopoverDescription>{t('common.mprInfo.body')}</PopoverDescription>
          <PopoverDescription>{t('common.mprInfo.counting')}</PopoverDescription>
          <PopoverDescription>{t('common.mprInfo.scale')}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
