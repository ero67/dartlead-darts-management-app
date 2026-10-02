import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

// "Delete my account" — required by Google Play for any app with sign-up, and
// the GDPR right to erasure. The database function delete_my_account() removes
// the auth user and everything that cascades from it; tournaments, leagues and
// player records (the organisers' event history) stay, without the account link.
export function AccountDeletion() {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (isDeleting) return;
    setIsOpen(false);
    setConfirmed(false);
    setError('');
  };

  const handleDelete = async () => {
    if (!confirmed || isDeleting) return;
    setIsDeleting(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'delete_failed');
      // The session is now invalid server-side; drop it locally and leave.
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Account deletion failed:', err);
      setError(t('account.deleteError'));
      setIsDeleting(false);
    }
  };

  return (
    <Card className="tw text-card-foreground">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="size-4 text-muted-foreground" />
          {t('account.title')}
        </CardTitle>
        <CardDescription>{t('account.deleteIntro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setIsOpen(true)}
        >
          <Trash2 />
          {t('account.deleteButton')}
        </Button>
      </CardContent>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="tw text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              {t('account.confirmTitle')}
            </DialogTitle>
            <DialogDescription>{t('account.confirmIntro')}</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>{t('account.confirmRemoved')}</li>
            <li>{t('account.confirmKept')}</li>
            <li>{t('account.confirmIrreversible')}</li>
          </ul>
          <Label htmlFor="account-delete-confirm" className="items-start gap-3 leading-snug font-normal">
            <Checkbox
              id="account-delete-confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              disabled={isDeleting}
              className="mt-0.5"
            />
            <span>{t('account.confirmCheckbox')}</span>
          </Label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isDeleting}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={!confirmed || isDeleting}>
              <Trash2 />
              {isDeleting ? t('account.deleting') : t('account.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
