import React from 'react';
import { BookOpen, CircleAlert, Compass, Database, RotateCcw, Sparkles } from 'lucide-react';

import { useLanguage } from '@/contexts/LanguageContext';
import { CodeBlock, CodeBlockContent, CodeBlockLine } from '@/components/ui/code-block';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';
import { useHighlightedCode } from '@/hooks/use-highlighted-code';
import { AssistantLogo } from './AssistantLogo';

// The tool's arguments and result as highlighted JSON (Shiki loads the JSON grammar on first use).
function JsonBlock({ value }) {
  const lines = useHighlightedCode(JSON.stringify(value, null, 2), 'json');
  return (
    <CodeBlock size="sm">
      <CodeBlockContent wrap className="max-h-48">
        {lines.map((line, i) => <CodeBlockLine key={i}>{line}</CodeBlockLine>)}
      </CodeBlockContent>
    </CodeBlock>
  );
}

// A human title for each step, from the graph node or tool and what it returned.
function stepTitle(step, t) {
  if (step.kind === 'rewrite') return t('assistant.trace.understood', { question: step.question });
  if (step.kind === 'route') {
    return step.sources.length
      ? t('assistant.trace.route', { sources: step.sources.map(s => t(`assistant.trace.source.${s}`)).join(' · ') })
      : t('assistant.trace.offTopic');
  }
  if (step.kind === 'retrieve') return t('assistant.trace.read', { count: step.items.length });

  const { name, args = {}, output, status } = step;
  if (status === 'error') return t('assistant.trace.failed', { tool: name });
  const known = ['find_player', 'get_player_stats', 'get_recent_matches', 'get_head_to_head', 'find_league', 'get_league_standings',
    'get_me', 'list_tournaments', 'find_tournament', 'get_tournament_summary', 'get_player_tournaments', 'get_records', 'list_leagues'];
  if (!known.includes(name)) return t(status === 'running' ? 'assistant.trace.running' : 'assistant.trace.ran', { tool: name });
  if (status === 'running') return t(`assistant.trace.tool.${name}.running`, { name: args.name });
  if (name === 'find_player' || name === 'find_league' || name === 'find_tournament') {
    const found = Array.isArray(output) ? output.map(c => c.name).join(', ') : '';
    return found ? t(`assistant.trace.tool.${name}.done`, { found }) : t(`assistant.trace.tool.${name}.none`, { name: args.name });
  }
  return t(`assistant.trace.tool.${name}.done`, {
    player: output?.player,
    league: output?.league,
    tournament: output?.tournament,
    // list_tournaments has a total; get_records counts the tournaments it searched; list_leagues lists leagues.
    count: output?.total ?? (typeof output?.tournaments === 'number' ? output.tournaments : output?.leagues?.length) ?? 0,
  });
}

const STEP_ICONS = { rewrite: RotateCcw, route: Compass, retrieve: BookOpen, tool: Database };

function TraceStep({ step }) {
  const { t } = useLanguage();
  const Icon = step.status === 'error' ? CircleAlert : STEP_ICONS[step.kind];
  const line = (
    <TraceLine status={step.status === 'running' ? 'running' : step.status === 'error' ? 'error' : undefined}>
      <TraceIcon>{step.status === 'running' ? <AssistantLogo mode="thinking" className="size-3.5" /> : <Icon />}</TraceIcon>
      <TraceTitle>{stepTitle(step, t)}</TraceTitle>
    </TraceLine>
  );
  const detail = step.kind === 'tool' && step.output !== undefined
    ? <><JsonBlock value={step.args} /><JsonBlock value={step.output} /></>
    : step.kind === 'retrieve'
      ? <ul className="list-disc pl-4 text-xs">{step.items.map((s, i) => <li key={i}>{s.section || s.source}</li>)}</ul>
      : null;

  return (
    <div className="animate-in fade-in slide-in-from-left-1 duration-300">
      {detail ? (
        <TraceCollapsible>
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="flex flex-col gap-2">{detail}</TraceCollapsibleContent>
        </TraceCollapsible>
      ) : line}
    </div>
  );
}

// "Working…" with the steps open while the answer streams; "Worked in N steps", closed, once it is done.
export function AssistantTrace({ steps, isStreaming, isOpen, onOpenChange }) {
  const { t } = useLanguage();
  if (!steps.length && !isStreaming) return null;
  return (
    <Trace>
      <TraceCollapsible open={isOpen} onOpenChange={onOpenChange}>
        <TraceCollapsibleTrigger>
          <TraceLine status={isStreaming ? 'running' : undefined}>
            <TraceIcon>{isStreaming ? <AssistantLogo mode="thinking" className="size-4" /> : <Sparkles />}</TraceIcon>
            <TraceTitle>{isStreaming ? t('assistant.trace.working') : t('assistant.trace.summary', { count: steps.length })}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>{steps.map(step => <TraceStep key={step.id} step={step} />)}</Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
