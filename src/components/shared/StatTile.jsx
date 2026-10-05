import React from 'react';
import { Card } from '@/components/ui/card';

// KPI tile: muted label above a big tabular number, optional hint line.
export function StatTile({ label, value, hint, icon: Icon }) {
  return (
    <Card className="gap-1 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}
