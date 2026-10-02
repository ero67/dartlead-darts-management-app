import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getSupportEmail } from '../utils/publicUrl';
import { Button } from '@/components/ui/button';

// Public page (no login needed) describing how to delete a DartLead account
// and what happens to the data — the URL Google Play's data-safety form asks
// for. The actual deletion happens in the app (My profile → Account).
export function DeleteAccountInfo() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const supportEmail = getSupportEmail();

  return (
    <div className="tw mx-auto flex max-w-3xl flex-col gap-8 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('account.pageTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.pageIntro')}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('account.stepsTitle')}</h2>
        <ol className="list-decimal pl-6 text-muted-foreground leading-7 [&>li]:mt-1">
          <li>{t('account.step1')}</li>
          <li>{t('account.step2')}</li>
          <li>{t('account.step3')}</li>
        </ol>
        <Button type="button" className="w-fit" onClick={() => navigate(user ? '/my-profile' : '/login')}>
          {user ? t('account.goToProfile') : t('account.signInFirst')}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('account.whatHappensTitle')}</h2>
        <ul className="list-disc pl-6 text-muted-foreground leading-7 [&>li]:mt-1">
          <li>{t('account.confirmRemoved')}</li>
          <li>{t('account.confirmKept')}</li>
          <li>{t('account.timing')}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('account.noAccessTitle')}</h2>
        <p className="text-muted-foreground leading-7">
          {t('account.noAccessText')}
          {supportEmail && (
            <>
              {' '}
              <a href={`mailto:${supportEmail}?subject=${encodeURIComponent('DartLead account deletion')}`} className="font-medium text-primary underline underline-offset-4">{supportEmail}</a>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
