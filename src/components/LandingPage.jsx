import React from 'react';
import { ArrowRight, CheckCircle2, Mail, Shield, Trophy, Activity, BarChart3, Users } from 'lucide-react';
import appScreenshot from '../assets/logo.png'; // placeholder; replace with real screenshot
import { useLanguage } from '../contexts/LanguageContext';

export function LandingPage() {
  const { t } = useLanguage();

  const features = [
    {
      icon: Trophy,
      title: t('landing.features.flexibleTitle'),
      description: t('landing.features.flexibleDesc')
    },
    {
      icon: Activity,
      title: t('landing.features.liveTitle'),
      description: t('landing.features.liveDesc')
    },
    {
      icon: BarChart3,
      title: t('landing.features.statsTitle'),
      description: t('landing.features.statsDesc')
    },
    {
      icon: Users,
      title: t('landing.features.playersTitle'),
      description: t('landing.features.playersDesc')
    }
  ];

  const steps = [
    { title: t('landing.steps.createTitle'), description: t('landing.steps.createDesc') },
    { title: t('landing.steps.addTitle'), description: t('landing.steps.addDesc') },
    { title: t('landing.steps.runTitle'), description: t('landing.steps.runDesc') }
  ];

  const scrollToContact = () => {
    const el = document.getElementById('contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-page">
      <header className="hero">
        <div className="hero-content">
          <p className="badge">{t('landing.heroBadge')}</p>
          <h1>{t('landing.heroTitle')}</h1>
          <p className="subheadline">
            {t('landing.heroSubtitle')}
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={scrollToContact}>
              {t('landing.ctaPrimary')} <ArrowRight size={18} />
            </button>
            <span className="ghost-btn" style={{ cursor: 'default' }}>
              {t('landing.ctaMail')} info@dartlead.app
            </span>
          </div>
          <div className="hero-checklist">
            <span><CheckCircle2 size={16} /> {t('landing.check1')}</span>
            <span><CheckCircle2 size={16} /> {t('landing.check2')}</span>
            <span><CheckCircle2 size={16} /> {t('landing.check3')}</span>
          </div>
        </div>
        <div className="hero-visual">
          <img src={appScreenshot} alt="DartLead preview" />
        </div>
      </header>

      <section className="section features">
        <div className="section-header">
          <p className="eyebrow">{t('landing.featuresEyebrow')}</p>
          <h2>{t('landing.featuresTitle')}</h2>
          <p className="section-sub">
            {t('landing.featuresSub')}
          </p>
        </div>
        <div className="feature-grid">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <f.icon size={24} />
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section steps">
        <div className="section-header">
          <p className="eyebrow">{t('landing.stepsEyebrow')}</p>
          <h2>{t('landing.stepsTitle')}</h2>
        </div>
        <div className="steps-grid">
          {steps.map((s, idx) => (
            <div className="step-card" key={s.title}>
              <div className="step-number">{idx + 1}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section contact" id="contact">
        <div className="contact-card">
          <div>
            <p className="eyebrow">{t('landing.contactEyebrow')}</p>
            <h2>{t('landing.contactTitle')}</h2>
            <p className="section-sub">
              {t('landing.contactSub')}
            </p>
            <div className="contact-chips">
              <span><Shield size={14} /> {t('landing.chip1')}</span>
              <span><CheckCircle2 size={14} /> {t('landing.chip2')}</span>
            </div>
            <div className="contact-email">
              <Mail size={16} /> info@dartlead.app
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LandingPage;

