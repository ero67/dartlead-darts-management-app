import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '@/lib/utils';

// Player names open the player's profile (same affordance as tournament views)
export function PlayerLink({ player, className = '' }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  if (!player?.id) return <span className={className}>{player?.name || t('common.unknown')}</span>;
  return (
    <button
      type="button"
      className={cn('font-medium text-foreground hover:underline', className)}
      onClick={(e) => { e.stopPropagation(); navigate(`/player/${player.id}`); }}
      title={t('playerProfile.viewProfile')}
    >
      {player.name}
    </button>
  );
}
