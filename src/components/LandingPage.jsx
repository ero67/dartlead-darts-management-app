import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, Check, CheckCircle2, Clock, Download, Globe, LineChart, Mail, MonitorPlay, Smartphone, Target, Trophy, Tv, WifiOff, Wifi } from 'lucide-react';
import logo from '../assets/logo-256.webp';
import { useLanguage } from '../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { BoardMotif, CheckoutRoute, FormDots, LegPips, LiveDot } from './shared/DartsAccents';
import { WinChanceChart } from './match/WinChanceChart';
import { AssistantLogo } from './assistant/AssistantLogo';
import { BOT_LEVELS } from '../lib/botPlayer';
import { tournamentService } from '../services/tournamentService';
import { ASSISTANT_URL, assistantService } from '../services/assistantService';

const CONTACT_EMAIL = 'info@dartlead.app';
const ANDROID_APK_URL = 'https://github.com/ero67/dartlead-darts-management-app/releases/download/android-latest/DartLead.apk';
// Set per environment once the demo league is seeded (docs/DEMO_LEAGUE.md);
// without it the demo button and section are hidden.
const DEMO_TOURNAMENT_ID = import.meta.env.VITE_DEMO_TOURNAMENT_ID;

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
// Player 1's win chance after each visit over three legs: wins leg 1, loses
// leg 2, trails in the decider and breaks back (the turning point).
const PREVIEW_WIN_CHANCE = [
  0.5, 0.54, 0.51, 0.58, 0.55, 0.62, 0.66, 0.71,
  0.67, 0.6, 0.62, 0.53, 0.49, 0.44,
  0.41, 0.36, 0.33, 0.29, 0.31, 0.43, 0.58, 0.79, 1,
].map((p, i) => ({ p, leg: i < 8 ? 1 : i < 14 ? 2 : 3 }));
const PREVIEW_TURNING_POINT = 19;
const PREVIEW_TV = [
  { board: 1, p1: 'Peter H.', p2: 'Jakub S.', legs: '2 – 1', score: '141 · 87' },
  { board: 2, p1: 'Eva T.', p2: 'Marek B.', legs: '0 – 1', score: '301 · 216' },
  { board: 3, free: true },
];
const PREVIEW_LEAGUE = [
  { name: 'Peter H.', form: [true, true, false, true], points: 46 },
  { name: 'Eva T.', form: [true, false, true, true], points: 41 },
  { name: 'Jakub S.', form: [false, true, true, false], points: 33 },
  { name: 'Marek B.', form: [false, false, true, false], points: 24 },
];

const PREVIEW_STANDINGS = [
  { name: 'Peter H.', won: 2, diff: '+5', avg: '81.6' },
  { name: 'Jakub S.', won: 2, diff: '+3', avg: '72.8' },
  { name: 'Filip R.', won: 0, diff: '-3', avg: '58.1' },
  { name: 'Adam N.', won: 0, diff: '-5', avg: '58.3' },
];

const PREVIEW_180S = [
  { name: 'Peter H.', count: 14 },
  { name: 'Eva T.', count: 9 },
  { name: 'Jakub S.', count: 6 },
];

// 1,725 -> "1,700+", 172 -> "170+", 4 -> "4": a claim that stays true for a while.
function formatStat(n, language) {
  const rounded = n >= 1000 ? Math.floor(n / 100) * 100 : n >= 100 ? Math.floor(n / 10) * 10 : n;
  return `${rounded.toLocaleString(language === 'sk' ? 'sk-SK' : 'en-GB')}${rounded < n ? '+' : ''}`;
}

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
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  // The assistant section shows only once admins open the assistant to everyone.
  const [isAssistantPublic, setIsAssistantPublic] = useState(false);

  useEffect(() => {
    tournamentService.getPublicStats().then(setStats);
    if (ASSISTANT_URL) assistantService.getSettings().then(s => setIsAssistantPublic(s?.audience === 'everyone'));
  }, []);

  const scrollToContact = () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  const proof = [
    { icon: WifiOff, label: t('landing.proof.offline') },
    { icon: Smartphone, label: t('landing.proof.android') },
    { icon: Target, label: t('landing.proof.games') },
    { icon: Globe, label: t('landing.proof.languages') },
  ];
  const steps = ['setup', 'signup', 'score', 'follow'].map(key => ({
    title: t(`landing.steps.${key}Title`),
    description: t(`landing.steps.${key}Desc`),
  }));
  const included = t('landing.included');
  const assistantPoints = t('landing.assistant.points');
  const faq = ['account', 'offline', 'devices', 'pay', 'data'];

  return (
    <div className="flex flex-col text-foreground">
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
            <h1 className="text-balance font-display text-6xl font-bold leading-[0.92] md:text-7xl xl:text-8xl">{t('landing.heroTitle')}</h1>
            <p className="max-w-xl text-lg leading-7 text-muted-foreground">{t('landing.heroSubtitle')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {DEMO_TOURNAMENT_ID ? (
                <>
                  <Button size="lg" onClick={() => navigate(`/tournament/${DEMO_TOURNAMENT_ID}`)}>
                    {t('landing.ctaDemo')}
                    <ArrowRight />
                  </Button>
                  <Button size="lg" variant="outline" onClick={scrollToContact}>{t('landing.ctaPrimary')}</Button>
                </>
              ) : (
                <Button size="lg" onClick={scrollToContact}>
                  {t('landing.ctaPrimary')}
                  <ArrowRight />
                </Button>
              )}
              <Button size="lg" variant="ghost" onClick={() => navigate('/practice')}>
                <Target />
                {t('landing.ctaPractice')}
              </Button>
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {proof.map(item => (
                <li key={item.label} className="flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-muted-foreground">
                  <item.icon className="size-3.5 text-primary" />
                  {item.label}
                </li>
              ))}
            </ul>
            {stats?.matches > 0 && (
              <dl className="flex flex-wrap gap-x-8 gap-y-3">
                {['matches', 'players', 'leagues'].map(key => (
                  <div key={key} className="flex flex-col-reverse">
                    <dt className="text-sm text-muted-foreground">{t(`landing.stats.${key}`)}</dt>
                    <dd className="font-display text-4xl font-bold leading-none tabular-nums">{formatStat(stats[key], language)}</dd>
                  </div>
                ))}
              </dl>
            )}
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
        <section aria-labelledby="why-title" className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-2">
            <Eyebrow>{t('landing.whyEyebrow')}</Eyebrow>
            <SectionTitle id="why-title">{t('landing.whyTitle')}</SectionTitle>
          </div>
          <div className="grid gap-4 lg:grid-cols-6">
            <Feature className="lg:col-span-4" icon={LineChart} title={t('landing.why.insightsTitle')} description={t('landing.why.insightsDesc')}>
              <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary"><span className="size-1.5 rounded-full bg-primary" />{t('landing.why.insightsTurning')} · {t('match.leg')} 3</Badge>
                  <Badge className="border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Trophy />{t('landing.why.insightsUpset')}</Badge>
                </div>
                <WinChanceChart points={PREVIEW_WIN_CHANCE} turningPointIndex={PREVIEW_TURNING_POINT} player1Name="Marek B." player2Name="Peter H." />
              </div>
            </Feature>

            <Feature className="lg:col-span-2" icon={Tv} title={t('landing.why.tvTitle')} description={t('landing.why.tvDesc')}>
              {/* Same forced-dark root the real TV view uses. */}
              <div className="dark-mode flex flex-col gap-1.5 rounded-lg bg-background p-3 text-foreground">
                {PREVIEW_TV.map(row => (
                  <div key={row.board} className="flex items-center gap-2 rounded-md bg-card px-2.5 py-2 text-sm">
                    <span className="font-display text-lg font-bold text-muted-foreground">{row.board}</span>
                    {row.free ? (
                      <span className="text-muted-foreground">{t('landing.why.tvFree')}</span>
                    ) : (
                      <>
                        <LiveDot />
                        <span className="min-w-0 flex-1 truncate font-medium">{row.p1} <span className="text-muted-foreground">·</span> {row.p2}</span>
                        <span className="font-display text-lg font-bold">{row.legs}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Feature>

            <Feature className="lg:col-span-2" icon={Wifi} title={t('landing.why.offlineTitle')} description={t('landing.why.offlineDesc')}>
              <div className="flex flex-col gap-2 text-sm">
                <span className="flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <WifiOff className="size-3.5" />{t('landing.why.offlineWaiting')}
                </span>
                <span className="flex w-fit items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-green-800 dark:bg-green-950 dark:text-green-200">
                  <Check className="size-3.5" />{t('landing.why.offlineSynced')}
                </span>
              </div>
            </Feature>

            <Feature className="lg:col-span-2" icon={Trophy} title={t('landing.why.leagueTitle')} description={t('landing.why.leagueDesc')}>
              <ol className="flex flex-col rounded-lg border bg-background text-sm">
                {PREVIEW_LEAGUE.map((row, index) => (
                  <li key={row.name} className="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
                    <span className={`w-4 font-display text-lg font-bold ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                    <FormDots results={row.form} />
                    <span className="w-14 text-right font-display text-lg font-bold">{row.points} <span className="font-sans text-xs font-normal text-muted-foreground">{t('landing.why.leaguePoints')}</span></span>
                  </li>
                ))}
              </ol>
            </Feature>

            <Feature className="lg:col-span-2" icon={Bot} title={t('landing.why.practiceTitle')} description={t('landing.why.practiceDesc')}>
              <div className="grid grid-cols-4 gap-1.5">
                {BOT_LEVELS.map(level => (
                  <span key={level.level} className="flex flex-col items-center rounded-md border bg-background py-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('landing.why.practiceLevel')} {level.level}</span>
                    <span className="font-display text-xl font-bold leading-none">{level.average}</span>
                  </span>
                ))}
              </div>
            </Feature>
          </div>
        </section>

        {/* Shown only where the assistant runs (VITE_ASSISTANT_URL) and is open to everyone. */}
        {isAssistantPublic && (
          <section aria-labelledby="assistant-title">
            <Card className="relative grid items-center gap-8 overflow-hidden bg-gradient-to-br from-primary/10 to-card p-6 md:p-10 lg:grid-cols-2">
              <BoardMotif className="-left-40 -top-48 w-[28rem]" />
              <div className="relative flex flex-col gap-4">
                <Eyebrow>{t('landing.assistant.eyebrow')}</Eyebrow>
                <SectionTitle id="assistant-title">{t('landing.assistant.title')}</SectionTitle>
                <p className="text-muted-foreground">{t('landing.assistant.sub')}</p>
                <ul className="flex flex-col gap-2">
                  {Array.isArray(assistantPoints) && assistantPoints.map(point => (
                    <li key={point} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                        <Check className="size-3" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">{t('landing.assistant.note')}</p>
              </div>

              {/* A frozen conversation built from the chat's own pieces. Sample names, not data. */}
              <div aria-hidden="true" className="relative flex flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
                <div className="flex items-center gap-2.5 border-b px-4 py-3">
                  <AssistantLogo mode="intro" className="size-7" />
                  <span className="font-semibold">{t('assistant.title')}</span>
                </div>
                <div className="flex flex-col gap-3 p-4 text-sm">
                  <Bubble align="end">
                    <BubbleContent>{t('landing.assistant.previewQuestion')}</BubbleContent>
                  </Bubble>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-primary" />
                    {t('landing.assistant.previewStep')}
                  </span>
                  <p className="leading-relaxed">{t('landing.assistant.previewAnswer')}</p>
                  <ol className="flex flex-col rounded-lg border">
                    {PREVIEW_180S.map((row, index) => (
                      <li key={row.name} className="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
                        <span className={`w-4 font-display text-lg font-bold ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                        <span className="font-display text-lg font-bold">{row.count}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Card>
          </section>
        )}

        <section aria-labelledby="how-title" className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-2">
            <Eyebrow>{t('landing.stepsEyebrow')}</Eyebrow>
            <SectionTitle id="how-title">{t('landing.stepsTitle')}</SectionTitle>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="relative h-full gap-2.5 overflow-hidden p-5">
                  <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-3 font-display text-[7.5rem] font-bold leading-none text-muted-foreground/10">{index + 1}</span>
                  <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary font-display text-xl font-bold text-primary-foreground">{index + 1}</span>
                  <h3 className="relative font-display text-3xl font-bold leading-none">{step.title}</h3>
                  <p className="relative text-sm text-muted-foreground">{step.description}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="included-title" className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-2">
            <Eyebrow>{t('landing.includedEyebrow')}</Eyebrow>
            <SectionTitle id="included-title">{t('landing.includedTitle')}</SectionTitle>
          </div>
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.isArray(included) && included.map(item => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                  <Check className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {DEMO_TOURNAMENT_ID && (
          <section aria-labelledby="demo-title">
            <Card className="dark-mode relative flex-row flex-wrap items-center justify-between gap-6 overflow-hidden bg-background p-6 text-foreground md:p-10">
              <BoardMotif className="-right-24 -top-40 w-[30rem]" />
              <div className="relative flex max-w-xl flex-col gap-2.5">
                <Eyebrow>{t('landing.demoEyebrow')}</Eyebrow>
                <SectionTitle id="demo-title">{t('landing.demoTitle')}</SectionTitle>
                <p className="text-muted-foreground">{t('landing.demoSub')}</p>
              </div>
              <div className="relative flex flex-wrap gap-2">
                <Button size="lg" onClick={() => navigate(`/tournament/${DEMO_TOURNAMENT_ID}`)}>
                  <Trophy />
                  {t('landing.demoOpen')}
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate(`/tv/${DEMO_TOURNAMENT_ID}?view=bracket`)}>
                  <MonitorPlay />
                  {t('landing.demoTv')}
                </Button>
              </div>
            </Card>
          </section>
        )}

        <section aria-labelledby="faq-title" className="grid gap-7 lg:grid-cols-[1fr_2fr]">
          <div className="flex flex-col gap-2">
            <Eyebrow>{t('landing.faqEyebrow')}</Eyebrow>
            <SectionTitle id="faq-title">{t('landing.faqTitle')}</SectionTitle>
          </div>
          <Accordion type="single" collapsible className="rounded-xl border px-4">
            {faq.map(key => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger className="text-base">{t(`landing.faq.${key}Q`)}</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2 text-muted-foreground">
                  <p>{t(`landing.faq.${key}A`)}</p>
                  {key === 'devices' && (
                    <a href={ANDROID_APK_URL} className="inline-flex w-fit items-center gap-1.5 font-medium text-primary underline underline-offset-4">
                      <Download className="size-4" />
                      {t('landing.faq.devicesLink')}
                    </a>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section id="contact" aria-labelledby="contact-title">
          <Card className="relative flex-row flex-wrap items-center justify-between gap-6 overflow-hidden bg-gradient-to-br from-primary/10 to-card p-6 md:p-10">
            <BoardMotif className="-bottom-56 -right-32 top-auto w-[26rem]" />
            <div className="relative flex max-w-xl flex-col gap-2.5">
              <Eyebrow>{t('landing.contactEyebrow')}</Eyebrow>
              <SectionTitle id="contact-title">{t('landing.contactTitle')}</SectionTitle>
              <p className="text-muted-foreground">{t('landing.contactSub')}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline"><CheckCircle2 /> {t('landing.chip1')}</Badge>
                <Badge variant="outline"><Clock /> {t('landing.chip2')}</Badge>
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
          <span className="flex flex-wrap items-center gap-4">
            <a href={ANDROID_APK_URL} className="underline-offset-4 hover:underline">{t('landing.proof.android')}</a>
            <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => navigate('/privacy')}>
              {t('navigation.privacy')}
            </Button>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, description, className = '', children }) {
  const Icon = icon;
  return (
    <Card className={`gap-4 p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold leading-snug">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-auto">{children}</div>
    </Card>
  );
}
