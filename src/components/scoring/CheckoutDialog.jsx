import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// Asked when a 3-dart total lands exactly on zero: how many darts did the
// finish take, and did it end on a double? `pending` is
// { total, dartsUsed: 1|2|3, finishedOnDouble: boolean }. The two hints under
// the outcome cards can be overridden where "leg won" is the wrong words (the
// checkout trainer scores attempts, not legs).
export function CheckoutDialog({ pending, onChange, onConfirm, onCancel, doubleOutHint, bustHint }) {
  const { t } = useLanguage();
  if (!pending) return null;

  return (
    <div className="leg-starter-dialog checkout-modal">
      <div className="dialog-content checkout-card">
        <div className="checkout-card__header">
          <span className="checkout-card__title">{t('match.checkout.title')}</span>
          <span className="checkout-card__total">{pending.total}</span>
        </div>

        <div className="checkout-card__section">
          <span className="checkout-card__section-label">{t('match.checkout.dartsLabel')}</span>
          <div className="checkout-darts-picker">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                type="button"
                className={`checkout-dart-option ${pending.dartsUsed === n ? 'active' : ''}`}
                onClick={() => onChange({ ...pending, dartsUsed: n })}
              >
                <span className="checkout-dart-option__num">{n}</span>
                <span className="checkout-dart-option__unit">
                  {t(n === 1 ? 'match.checkout.dartUnitOne' : 'match.checkout.dartUnitMany')}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="checkout-card__section">
          <span className="checkout-card__section-label">{t('match.checkout.outcomeLabel')}</span>
          <div className="checkout-outcome-picker">
            <button
              type="button"
              className={`checkout-outcome-card checkout-outcome-card--double ${pending.finishedOnDouble ? 'active' : ''}`}
              onClick={() => onChange({ ...pending, finishedOnDouble: true })}
            >
              <CheckCircle size={22} />
              <span className="checkout-outcome-card__title">{t('match.checkout.doubleOut')}</span>
              <span className="checkout-outcome-card__hint">{doubleOutHint || t('match.checkout.doubleOutHint')}</span>
            </button>
            <button
              type="button"
              className={`checkout-outcome-card checkout-outcome-card--bust ${!pending.finishedOnDouble ? 'active' : ''}`}
              onClick={() => onChange({ ...pending, finishedOnDouble: false })}
            >
              <XCircle size={22} />
              <span className="checkout-outcome-card__title">{t('match.checkout.bust')}</span>
              <span className="checkout-outcome-card__hint">{bustHint || t('match.checkout.bustHint')}</span>
            </button>
          </div>
        </div>

        <div className="checkout-card__actions">
          <button type="button" className="checkout-card__cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`checkout-card__confirm ${pending.finishedOnDouble ? '' : 'checkout-card__confirm--bust'}`}
            onClick={() => onConfirm(pending)}
          >
            {t('match.checkout.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
