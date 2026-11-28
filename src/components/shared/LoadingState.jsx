import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Centered spinner with optional caption, for whole-page loading.
export function LoadingState({ text }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin" />
      {text && <p className="text-sm">{text}</p>}
    </div>
  );
}

// Placeholder cards in the list grid, so a list never flashes "nothing here" while it loads.
export function CardGridSkeleton({ label }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map(i => (
        <Card key={i} className="gap-4">
          <CardHeader className="gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent><Skeleton className="h-4 w-1/2" /></CardContent>
          <CardFooter><Skeleton className="h-9 w-32" /></CardFooter>
        </Card>
      ))}
    </div>
  );
}
