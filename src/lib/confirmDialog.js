// Promise-based replacement for window.confirm, rendered by <ConfirmDialogHost />
// (src/components/shared/ConfirmDialog.jsx), which must be mounted once in App.
//   if (!(await confirmDialog(t('…confirmDelete')))) return;
// Only one confirm is open at a time; a new request cancels a pending one.
let listener = null;

export function setConfirmListener(next) {
  listener = next;
}

export function confirmDialog(message, { title, confirmLabel, cancelLabel, destructive = false } = {}) {
  // Cypress auto-accepts native confirms; keep the e2e suite on that path.
  if (typeof window !== 'undefined' && window.Cypress) return Promise.resolve(window.confirm(message));
  if (!listener) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    listener({ message, title, confirmLabel, cancelLabel, destructive, resolve });
  });
}
