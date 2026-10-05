import React, { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { setConfirmListener } from '../../lib/confirmDialog';

// Host for confirmDialog() from src/lib/confirmDialog.js. Mount once in App.
export function ConfirmDialogHost({ labels }) {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    setConfirmListener((next) => {
      setRequest((current) => {
        current?.resolve(false);
        return next;
      });
    });
    return () => setConfirmListener(null);
  }, []);

  const settle = (value) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="whitespace-pre-line font-medium leading-6">{request?.title || request?.message}</AlertDialogTitle>
          {request?.title && (
            <AlertDialogDescription className="whitespace-pre-line">{request.message}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{request?.cancelLabel || labels.cancel}</AlertDialogCancel>
          <AlertDialogAction variant={request?.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
            {request?.confirmLabel || labels.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
