import React from 'react';
import { CopyPlus, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The tournament header's rarely used actions, kept out of the button row so
// Start / TV / Edit stay the obvious ones and Delete is never one tap away.
export function TournamentActionsMenu({ tournament, onCopy, onDelete, t }) {
  if (!onCopy && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('common.moreActions')} title={t('common.moreActions')}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {onCopy && (
          <DropdownMenuItem onClick={onCopy}>
            <CopyPlus />
            {tournament.leagueId ? t('tournaments.nextRound') : t('tournaments.duplicate')}
          </DropdownMenuItem>
        )}
        {onCopy && onDelete && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            {t('management.deleteTournament')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
