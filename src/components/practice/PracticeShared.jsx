import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Play, RotateCcw, Settings2 } from 'lucide-react';
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

// Setup screen shell: the settings card every game shows before the first
// dart. `children` are PracticeField sections; `recap` is the one-line
// read-back of the current settings shown next to the start button.
export function PracticeSetup({ title, subtitle, recap, children, note, onStart }) {
  const { t } = useLanguage();
  return (
    <div className="practice-setup">
      <div className="practice-setup-head">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="practice-setup-sections">{children}</div>
      {note && <p className="practice-setup-note">{note}</p>}
      <div className="practice-setup-actions">
        {recap && <div className="practice-setup-recap">{recap}</div>}
        <button type="button" className="practice-start-btn" onClick={onStart}>
          <Play size={18} /> {t('practice.start')}
        </button>
      </div>
    </div>
  );
}

// One settings section inside PracticeSetup. Each gets its own colour (`tone`)
// so the sections read apart at a glance; the chips inside inherit it.
export function PracticeField({ icon: Icon, label, hint, value, tone = 'green', children }) {
  return (
    <section className={`practice-field practice-field--${tone}`}>
      <div className="practice-field-head">
        {Icon && <span className="practice-field-icon"><Icon size={16} /></span>}
        <div className="practice-field-labels">
          <span className="practice-field-label">{label}</span>
          {hint && <span className="practice-field-hint">{hint}</span>}
        </div>
        {value !== null && value !== undefined && value !== '' && (
          <span className="practice-field-value">{value}</span>
        )}
      </div>
      <div className="practice-field-body">{children}</div>
    </section>
  );
}

// Two-up (or more) cards for a setting that needs a line of explanation each.
export function PracticeOptionCards({ options, value, onChange }) {
  return (
    <div className="practice-mode-cards">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`practice-mode-card ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          {option.hint && <span>{option.hint}</span>}
        </button>
      ))}
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
