import React from 'react';
import { ShieldAlert } from 'lucide-react';

// "You can't be here" notice for role-guarded routes.
export function AccessNotice({ title, lines = [] }) {
  return (
    <div className="tw flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <ShieldAlert className="size-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {lines.map((line) => (
        <p key={line} className="max-w-md text-sm text-muted-foreground">{line}</p>
      ))}
    </div>
  );
}
