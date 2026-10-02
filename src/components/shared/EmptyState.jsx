import React from 'react';

// Dashed placeholder for lists with nothing in them. `icon` is a lucide component.
export function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-6" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
