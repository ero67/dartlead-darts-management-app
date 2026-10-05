import React from 'react';
import { Badge } from '@/components/ui/badge';
import { tournamentStatusLabel, tournamentStatusClass, isTournamentRunning } from '../../utils/tournamentStatus';

// Tournament (and league) lifecycle badge: Registration / In progress / Completed.
export function StatusBadge({ status, t, className = '' }) {
  return (
    <Badge variant="outline" className={`${tournamentStatusClass(status)} ${className}`}>
      {isTournamentRunning(status) && <span className="size-1.5 rounded-full bg-current" />}
      {tournamentStatusLabel(status, t)}
    </Badge>
  );
}
