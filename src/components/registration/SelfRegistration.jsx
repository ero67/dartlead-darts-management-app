import React from 'react';
import { AlertCircle, CheckCircle, Clock, Plus, UserCheck, X, XCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DisplayNameEditor } from '../DisplayNameEditor';

const approvedAlert = 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
const pendingAlert = 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
const rejectedAlert = 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';

// The viewer's own registration state: anonymous (log in), not registered,
// pending, approved, rejected, or already on the player list.
export function SelfRegistration({
  user,
  myPlayerEntry,
  myRegistration,
  showNameEditor,
  setShowNameEditor,
  registerLoading,
  error,
  onLogin,
  onRegister,
  onWithdraw,
}) {
  const { t } = useLanguage();

  if (!user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{t('registration.loginToRegisterHint')}</p>
          <Button onClick={onLogin}>
            <UserCheck />
            {t('registration.loginToRegister')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3">
        {myPlayerEntry ? (
          <Alert className={approvedAlert}>
            <UserCheck />
            <AlertTitle>{t('registration.youAreRegistered')}</AlertTitle>
          </Alert>
        ) : (
          <>
            {!myRegistration && (
              <>
                {showNameEditor ? (
                  <div className="flex w-full flex-col gap-2">
                    <p className="text-sm text-muted-foreground">{t('registration.nameRequiredHint')}</p>
                    <DisplayNameEditor
                      currentName=""
                      onSaved={(newName) => onRegister(newName)}
                      onCancel={() => setShowNameEditor(false)}
                    />
                  </div>
                ) : (
                  <Button size="lg" onClick={() => onRegister()} disabled={registerLoading}>
                    <Plus />
                    {registerLoading ? t('common.loading') : t('registration.registerForTournament')}
                  </Button>
                )}
                <p className="text-sm text-muted-foreground">{t('registration.selfRegisterHint')}</p>
              </>
            )}
            {myRegistration?.status === 'pending' && (
              <>
                <Alert className={pendingAlert}>
                  <Clock />
                  <AlertTitle>{t('registration.alreadyRegistered')}</AlertTitle>
                  <AlertDescription className="text-current/80">{t('registration.registrationSubmitted')}</AlertDescription>
                </Alert>
                <Button variant="outline" onClick={onWithdraw} disabled={registerLoading}>
                  <X />
                  {t('registration.withdrawRegistration')}
                </Button>
              </>
            )}
            {myRegistration?.status === 'approved' && (
              <Alert className={approvedAlert}>
                <CheckCircle />
                <AlertTitle>{t('registration.registrationApproved')}</AlertTitle>
              </Alert>
            )}
            {myRegistration?.status === 'rejected' && (
              <Alert className={rejectedAlert}>
                <XCircle />
                <AlertTitle>{t('registration.registrationRejected')}</AlertTitle>
                <AlertDescription className="text-current/80">{t('registration.registrationRejectedHint')}</AlertDescription>
              </Alert>
            )}
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
