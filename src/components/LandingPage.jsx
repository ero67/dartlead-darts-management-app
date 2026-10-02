import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, Mail, Shield, Trophy, Activity, BarChart3, Users, Target } from 'lucide-react';
import appScreenshot from '../assets/logo.png'; // placeholder; replace with real screenshot
import { useLanguage } from '../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LandingPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

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
    },
    {
      icon: Target,
      title: t('landing.features.practiceTitle'),
      description: t('landing.features.practiceDesc')
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
    <div className="tw mx-auto flex w-full max-w-7xl flex-col gap-16 p-4 text-foreground md:p-8">
      <header className="grid items-center gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Badge variant="secondary" className="w-fit">{t('landing.heroBadge')}</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{t('landing.heroTitle')}</h1>
          <p className="text-lg text-muted-foreground leading-7">
            {t('landing.heroSubtitle')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={scrollToContact}>
              {t('landing.ctaPrimary')} <ArrowRight />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/practice')}>
              <Target /> {t('landing.ctaPractice')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t('landing.ctaMail')} info@dartlead.app
            </span>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {[t('landing.check1'), t('landing.check2'), t('landing.check3')].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                  <Check className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-center">
          <img src={appScreenshot} alt="DartLead preview" className="w-full max-w-sm" />
        </div>
      </header>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">{t('landing.featuresEyebrow')}</p>
          <h2 className="text-2xl font-semibold tracking-tight">{t('landing.featuresTitle')}</h2>
          <p className="max-w-2xl text-muted-foreground">
            {t('landing.featuresSub')}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <CardTitle>{f.title}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">{t('landing.stepsEyebrow')}</p>
          <h2 className="text-2xl font-semibold tracking-tight">{t('landing.stepsTitle')}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, idx) => (
            <Card key={s.title}>
              <CardHeader>
                <Badge className="mb-2 size-8 justify-center rounded-full px-0 text-sm tabular-nums">{idx + 1}</Badge>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section id="contact">
        <Card>
          <CardHeader>
            <p className="text-sm font-medium uppercase tracking-wide text-primary">{t('landing.contactEyebrow')}</p>
            <CardTitle className="text-2xl font-semibold tracking-tight">{t('landing.contactTitle')}</CardTitle>
            <CardDescription className="max-w-2xl text-base">
              {t('landing.contactSub')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline"><Shield /> {t('landing.chip1')}</Badge>
              <Badge variant="outline"><CheckCircle2 /> {t('landing.chip2')}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail className="size-4" /> info@dartlead.app
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default LandingPage;
