import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getSupportEmail } from '../utils/publicUrl';

// Public page (no login needed) describing how to delete a DartLead account
// and what happens to the data — the URL Google Play's data-safety form asks
// for. The actual deletion happens in the app (My profile → Account).
export function DeleteAccountInfo() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const supportEmail = getSupportEmail();

  return (
    <div className="page-container delete-account-page">
      <div className="page-header">
        <h1>{t('account.pageTitle')}</h1>
        <p className="muted">{t('account.pageIntro')}</p>
      </div>

      <section>
        <h2>{t('account.stepsTitle')}</h2>
        <ol>
          <li>{t('account.step1')}</li>
          <li>{t('account.step2')}</li>
          <li>{t('account.step3')}</li>
        </ol>
        <button type="button" className="primary-btn" onClick={() => navigate(user ? '/my-profile' : '/login')}>
          {user ? t('account.goToProfile') : t('account.signInFirst')}
        </button>
      </section>

      <section>
        <h2>{t('account.whatHappensTitle')}</h2>
        <ul>
          <li>{t('account.confirmRemoved')}</li>
          <li>{t('account.confirmKept')}</li>
          <li>{t('account.timing')}</li>
        </ul>
      </section>

      <section>
        <h2>{t('account.noAccessTitle')}</h2>
        <p>
          {t('account.noAccessText')}
          {supportEmail && (
            <>
              {' '}
              <a href={`mailto:${supportEmail}?subject=${encodeURIComponent('DartLead account deletion')}`}>{supportEmail}</a>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
