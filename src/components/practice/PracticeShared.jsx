import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, RotateCcw, Settings2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// Page header used by every game's setup screen.
export function PracticeScreenHeader({ title, description, children }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="practice-header">
      <div>
        <button type="button" className="practice-link-btn" onClick={() => navigate('/practice')}>
          <ArrowLeft size={16} /> {t('practice.backToPractice')}
        </button>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

// Chip row for a setting with a small fixed set of values.
export function PracticeChips({ options, value, onChange, render }) {
  return (
    <div className="practice-chips">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          className={`practice-chip ${value === option ? 'active' : ''}`}
          onClick={() => onChange(option)}
        >
          {render ? render(option) : option}
        </button>
      ))}
    </div>
  );
}

// End-of-session screen: stat cards plus play again / settings / back.
export function PracticeSummary({ subtitle, cards, extra, onPlayAgain, onChangeSettings }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="practice-summary">
      <div className="practice-summary-header">
        <CheckCircle size={44} />
        <h2>{t('practice.sessionComplete')}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="stats-grid">
        {cards.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <div className="stat-content">
              <h3>{value}</h3>
              <p>{label}</p>
            </div>
          </div>
        ))}
      </div>
      {extra}
      <div className="practice-summary-actions">
        <button type="button" className="create-tournament-btn" onClick={onPlayAgain}>
          <RotateCcw size={18} /> {t('practice.playAgain')}
        </button>
        <button type="button" className="practice-ghost-btn" onClick={onChangeSettings}>
          <Settings2 size={16} /> {t('practice.changeSettings')}
        </button>
        <button type="button" className="practice-ghost-btn" onClick={() => navigate('/practice')}>
          <ArrowLeft size={16} /> {t('practice.backToPractice')}
        </button>
      </div>
    </div>
  );
}

// "Hardest numbers" list shown under a summary.
export function PracticeHardestList({ title, items, unitLabel }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="practice-hardest">
      <h3>{title}</h3>
      <div className="practice-hardest-list">
        {items.map((item) => (
          <span key={item.target}>
            <b>{item.target === 25 ? 'Bull' : item.target}</b> {unitLabel(item)}
          </span>
        ))}
      </div>
    </div>
  );
}
