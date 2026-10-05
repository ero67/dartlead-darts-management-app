import React from 'react';
import { Loader2 } from 'lucide-react';

// Centered spinner with optional caption, for whole-page loading.
export function LoadingState({ text }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin" />
      {text && <p className="text-sm">{text}</p>}
    </div>
  );
}
