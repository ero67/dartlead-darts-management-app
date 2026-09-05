import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

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
    <section className="profile-section account-section">
      <h2><Trash2 size={18} />{t('account.title')}</h2>
      <p className="account-section__text">{t('account.deleteIntro')}</p>
      <button type="button" className="danger-outline-btn" onClick={() => setIsOpen(true)}>
        <Trash2 size={16} />
        {t('account.deleteButton')}
      </button>

      {isOpen && createPortal(
        <div className="modal-overlay account-delete-overlay" onClick={close}>
          <div className="modal-content account-delete-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="account-delete-modal__header">
              <h2><AlertTriangle size={20} />{t('account.confirmTitle')}</h2>
              <button type="button" className="close-btn" onClick={close} aria-label={t('common.cancel')} disabled={isDeleting}>
                <X size={18} />
              </button>
            </div>
            <div className="account-delete-modal__body">
              <p>{t('account.confirmIntro')}</p>
              <ul>
                <li>{t('account.confirmRemoved')}</li>
                <li>{t('account.confirmKept')}</li>
                <li>{t('account.confirmIrreversible')}</li>
              </ul>
              <label className="account-delete-modal__check">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={isDeleting} />
                <span>{t('account.confirmCheckbox')}</span>
              </label>
              {error && <p className="error-message">{error}</p>}
            </div>
            <div className="account-delete-modal__footer">
              <button type="button" className="cancel-btn" onClick={close} disabled={isDeleting}>
                {t('common.cancel')}
              </button>
              <button type="button" className="danger-btn" onClick={handleDelete} disabled={!confirmed || isDeleting}>
                <Trash2 size={16} />
                {isDeleting ? t('account.deleting') : t('account.confirmButton')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
