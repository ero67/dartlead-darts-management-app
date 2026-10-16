import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, LogIn, Mail, Shield, Trophy, Activity, BarChart3, Users, Target, LayoutDashboard } from 'lucide-react';
import logo from '../assets/logo.png';
import logoIcon from '../assets/logo-icon.png';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BoardMotif, CheckoutRoute, LegPips, LiveDot } from './shared/DartsAccents';

const CONTACT_EMAIL = 'info@dartlead.app';

// Decorative product preview: a frozen scoreboard and group table built from
// the same pieces the real screens use. Sample names, not data.
const PREVIEW_MATCH = {
  players: [
    { name: 'Peter H.', legs: 2, score: 141, throwing: true },
    { name: 'Jakub S.', legs: 1, score: 87 },
  ],
  legsToWin: 3,
  route: ['T20', 'T19', 'D12'],
  average: '84.3',
};
const PREVIEW_STANDINGS = [
  { name: 'Peter H.', won: 2, diff: '+5', avg: '81.6' },
  { name: 'Jakub S.', won: 2, diff: '+3', avg: '72.8' },
  { name: 'Filip R.', won: 0, diff: '-3', avg: '58.1' },
  { name: 'Adam N.', won: 0, diff: '-5', avg: '58.3' },
];

function Wordmark({ className = '' }) {
  return (
    <span className={`font-display text-2xl font-bold leading-none tracking-wide ${className}`}>
      DART<span className="text-primary">LEAD</span>
    </span>
  );
}

function Eyebrow({ children }) {
  return <span className="text-xs font-semibold uppercase tracking-widest text-primary">{children}</span>;
}

function SectionTitle({ id, children }) {
  return <h2 id={id} className="font-display text-4xl font-bold leading-none md:text-5xl">{children}</h2>;
}

export function LandingPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const navLinks = [
    { path: '/practice', label: t('navigation.practice') },
    { path: '/tournaments', label: t('navigation.tournaments') },
    { path: '/leagues', label: t('navigation.leagues') },
  ];

  const features = [
    { icon: Trophy, title: t('landing.features.flexibleTitle'), description: t('landing.features.flexibleDesc') },
    { icon: Activity, title: t('landing.features.liveTitle'), description: t('landing.features.liveDesc') },
    { icon: BarChart3, title: t('landing.features.statsTitle'), description: t('landing.features.statsDesc') },
    { icon: Users, title: t('landing.features.playersTitle'), description: t('landing.features.playersDesc') },
    { icon: Target, title: t('landing.features.practiceTitle'), description: t('landing.features.practiceDesc') },
  ];

  const steps = [
    { title: t('landing.steps.createTitle'), description: t('landing.steps.createDesc') },
    { title: t('landing.steps.addTitle'), description: t('landing.steps.addDesc') },
    { title: t('landing.steps.runTitle'), description: t('landing.steps.runDesc') },
  ];

  const handleRequestAccess = () => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col text-foreground">
      <header className="border-b bg-background/85 backdrop-blur lg:sticky lg:top-0 lg:z-10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <a href="/" className="flex items-center gap-2.5" aria-label="DartLead" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <img src={logoIcon} alt="" className="size-8 rounded-lg object-cover" />
            <Wordmark />
          </a>
          <nav aria-label={t('navigation.menu')} className="flex flex-wrap items-center gap-1">
            {navLinks.map(link => (
              <Button key={link.path} variant="ghost" onClick={() => navigate(link.path)}>{link.label}</Button>
            ))}
            {user ? (
              <Button variant="outline" className="ml-1" onClick={() => navigate('/dashboard')}>
                <LayoutDashboard />
                {t('navigation.dashboard')}
              </Button>
            ) : (
              <Button variant="outline" className="ml-1" onClick={() => navigate('/login')}>
                <LogIn />
                {t('navigation.login')}
              </Button>
            )}
          </nav>
        </div>
      </header>

      <section aria-label={t('landing.heroBadge')} className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-background">
        <BoardMotif className="-right-56 -top-32 w-[48rem]" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            {/* The logo's wordmark is white, so it sits on a dark tile in both themes. */}
            <span className="inline-flex w-fit rounded-2xl bg-zinc-900 p-3 shadow-md">
              <img src={logo} alt="DartLead" className="size-24 md:size-32" />
            </span>
            <Badge variant="secondary" className="w-fit gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" />
              {t('landing.heroBadge')}
            </Badge>
            <h1 className="font-display text-6xl font-bold leading-[0.92] md:text-7xl xl:text-8xl">{t('landing.heroTitle')}</h1>
            <p className="max-w-lg text-lg leading-7 text-muted-foreground">{t('landing.heroSubtitle')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" onClick={handleRequestAccess}>
                {t('landing.ctaPrimary')}
                <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/practice')}>
                <Target />
                {t('landing.ctaPractice')}
              </Button>
              <Button size="lg" variant="ghost" className="text-muted-foreground" asChild>
                <a href={`mailto:${CONTACT_EMAIL}`}>
                  <Mail />
                  {t('landing.ctaMail')} {CONTACT_EMAIL}
                </a>
              </Button>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {[t('landing.check1'), t('landing.check2'), t('landing.check3')].map(item => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden="true" className="flex max-w-lg flex-col gap-3.5 lg:justify-self-end lg:w-full">
            <Card className="gap-3 p-4 shadow-lg">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Badge className="border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200">
                  <LiveDot />
                  {t('liveMatches.live')}
                </Badge>
                <span>{t('tv.board')} 1 · {t('match.leg')} 4 · {t('match.firstTo')} {PREVIEW_MATCH.legsToWin}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-0.5">
                {PREVIEW_MATCH.players.map(player => (
                  <React.Fragment key={player.name}>
                    <span className={`flex items-center gap-2 ${player.throwing ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                      <span className={`size-1.5 rounded-full ${player.throwing ? 'bg-primary' : ''}`} />
                      {player.name}
                    </span>
                    <LegPips won={player.legs} total={PREVIEW_MATCH.legsToWin} className={player.throwing ? 'text-primary' : 'text-muted-foreground'} />
                    <span className={`font-display text-5xl font-bold leading-none ${player.throwing ? '' : 'text-muted-foreground'}`}>{player.score}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('management.checkout')}</span>
                <CheckoutRoute route={PREVIEW_MATCH.route} />
                <span className="ml-auto">{t('match.average')} <b className="text-foreground">{PREVIEW_MATCH.average}</b></span>
              </div>
            </Card>

            <Card className="gap-0 overflow-hidden py-0 shadow-lg lg:ml-12">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="font-semibold">{t('manager.group')} A</span>
                <span className="text-xs text-muted-foreground">{t('landing.preview.tournamentName')}</span>
              </div>
              <div className="grid grid-cols-[1.5rem_1fr_2rem_2.5rem_3rem] gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>#</span><span>{t('management.player')}</span>
                <span className="text-right">{t('management.won')}</span>
                <span className="text-right">{t('management.legsDiff')}</span>
                <span className="text-right">{t('management.avg')}</span>
              </div>
              {PREVIEW_STANDINGS.map((row, index) => {
                const isQualifying = index < 2;
                return (
                  <div key={row.name} className={`grid grid-cols-[1.5rem_1fr_2rem_2.5rem_3rem] items-center gap-2 border-t px-4 py-2 text-sm ${isQualifying ? 'bg-primary/5' : ''}`}>
                    <span className={`font-display text-lg font-bold ${isQualifying ? 'text-primary' : 'text-muted-foreground'}`}>{index + 1}</span>
                    <span className="font-medium">{row.name}</span>
                    <span className="text-right font-semibold">{row.won}</span>
                    <span className={`text-right ${isQualifying ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>{row.diff}</span>
                    <span className="text-right text-muted-foreground">{row.avg}</span>
                  </div>
                );
              })}
            </Card>
          </div>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 pt-14 md:px-8 md:gap-24 md:pt-20">
        <section aria-labelledby="features-title" className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-2">
            <Eyebrow>{t('landing.featuresEyebrow')}</Eyebrow>
            <SectionTitle id="features-title">{t('landing.featuresTitle')}</SectionTitle>
            <p className="text-muted-foreground">{t('landing.featuresSub')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {features.map(feature => (
              <Card key={feature.title} className="gap-3 p-5">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="how-title" className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-2">
            <Eyebrow>{t('landing.stepsEyebrow')}</Eyebrow>
            <SectionTitle id="how-title">{t('landing.stepsTitle')}</SectionTitle>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="relative h-full gap-2.5 overflow-hidden p-5">
                  <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-3 font-display text-[7.5rem] font-bold leading-none text-muted-foreground/10">{index + 1}</span>
                  <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary font-display text-xl font-bold text-primary-foreground">{index + 1}</span>
                  <h3 className="relative font-display text-3xl font-bold leading-none">{step.title}</h3>
                  <p className="relative max-w-xs text-sm text-muted-foreground">{step.description}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section id="contact" aria-labelledby="contact-title">
          <Card className="relative flex-row flex-wrap items-center justify-between gap-6 overflow-hidden bg-gradient-to-br from-primary/10 to-card p-6 md:p-10">
            <BoardMotif className="-bottom-56 -right-32 top-auto w-[26rem]" />
            <div className="relative flex max-w-xl flex-col gap-2.5">
              <Eyebrow>{t('landing.contactEyebrow')}</Eyebrow>
              <SectionTitle id="contact-title">{t('landing.contactTitle')}</SectionTitle>
              <p className="text-muted-foreground">{t('landing.contactSub')}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline"><Shield /> {t('landing.chip1')}</Badge>
                <Badge variant="outline"><CheckCircle2 /> {t('landing.chip2')}</Badge>
              </div>
            </div>
            <Button size="lg" className="relative" asChild>
              <a href={`mailto:${CONTACT_EMAIL}`}>
                <Mail />
                {CONTACT_EMAIL}
              </a>
            </Button>
          </Card>
        </section>
      </main>

      <footer className="mt-16 border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground md:px-8">
          <span className="flex items-center gap-2">
            <Wordmark className="text-lg text-muted-foreground" />
            © {new Date().getFullYear()} DartLead
          </span>
          <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => navigate('/privacy')}>
            {t('navigation.privacy')}
          </Button>
        </div>
      </footer>
    </div>
  );
}
