import React, { useState } from 'react';
import { ArrowUp, SquarePen } from 'lucide-react';
import { Streamdown } from 'streamdown';

import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Message, MessageContent } from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AssistantTrace } from './AssistantTrace';
import { AssistantLogo } from './AssistantLogo';
import { assistantService } from '@/services/assistantService';

const SUGGESTIONS = ['assistant.suggestion1', 'assistant.suggestion2', 'assistant.suggestion3', 'assistant.suggestion4'];

// One stream event -> the assistant message it belongs to (see /chat in assistant/src/assistant/server.py).
function applyEvent(message, event) {
  switch (event.type) {
    case 'step':
      return { ...message, steps: [...message.steps, { id: event.kind, ...event }] };
    case 'sources':
      return { ...message, sources: event.items, steps: [...message.steps, { id: 'retrieve', kind: 'retrieve', items: event.items }] };
    case 'tool_start':
      return { ...message, steps: [...message.steps, { id: event.id, kind: 'tool', name: event.name, args: event.args, status: 'running' }] };
    case 'tool_end':
      return {
        ...message,
        steps: message.steps.map(s => (s.id === event.id ? { ...s, status: event.status === 'error' ? 'error' : 'done', output: event.output } : s)),
      };
    case 'text':
      return { ...message, text: message.text + event.delta };
    case 'done':
      return { ...message, status: 'done', isTraceOpen: false };
    case 'error':
      return { ...message, status: 'error', isTraceOpen: false, error: event.message };
    default:
      return message;
  }
}

// The model keeps citing its tools ("[stats]", "[záznam z DartLead]") despite the prompt; only [n] cites a doc.
// Drop any other short bracket that is not a markdown link "[text](url)".
const PSEUDO_CITATION = /\s?\[(?!\d+\])[^\]\n]{1,40}\](?!\()/g;
const CITES_A_SOURCE = /\[\d+\]/;

function AssistantReply({ message, onTraceOpenChange }) {
  const { t } = useLanguage();
  const isStreaming = message.status === 'streaming';
  const text = message.text.replace(PSEUDO_CITATION, '');
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AssistantTrace steps={message.steps} isStreaming={isStreaming} isOpen={message.isTraceOpen} onOpenChange={onTraceOpenChange} />
      {text && (
        <Streamdown className="text-sm leading-relaxed [&_table]:text-xs" isAnimating={isStreaming}>
          {text}
        </Streamdown>
      )}
      {message.status === 'error' && (
        <p className="text-sm text-destructive">{message.error || t('assistant.error')}</p>
      )}
      {/* The numbered doc sections the reply cites as [1], [2]…; none when the reply cites nothing */}
      {message.status === 'done' && message.sources.length > 0 && CITES_A_SOURCE.test(text) && (
        <div className="flex flex-wrap gap-1.5 animate-in fade-in duration-500">
          {message.sources.map((s, i) => (
            <Badge key={i} variant="outline" className="font-normal text-muted-foreground" title={s.source}>
              {i + 1} · {s.section || s.source}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssistantPanel({ isOpen, onOpenChange }) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  // One thread per conversation; the service keeps its history under this id.
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());

  const updateMessage = (id, change) => setMessages(prev => prev.map(m => (m.id === id ? change(m) : m)));

  const handleNewChat = () => {
    setMessages([]);
    setThreadId(crypto.randomUUID());
  };

  const send = async (raw) => {
    const text = raw.trim();
    if (!text || isSending) return;
    const replyId = crypto.randomUUID();
    setDraft('');
    setIsSending(true);
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text },
      { id: replyId, role: 'assistant', text: '', steps: [], sources: [], status: 'streaming', isTraceOpen: true },
    ]);
    try {
      await assistantService.streamChat({ message: text, threadId, onEvent: (event) => updateMessage(replyId, m => applyEvent(m, event)) });
      // A stream that ends without "done" (connection dropped) still stops the loader.
      updateMessage(replyId, m => (m.status === 'streaming' ? { ...m, status: 'done', isTraceOpen: false } : m));
    } catch (error) {
      const text = error.status === 429 ? t('assistant.limitReached') : error.status === 403 ? t('assistant.notAvailable') : error.message;
      updateMessage(replyId, m => ({ ...m, status: 'error', isTraceOpen: false, error: text }));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    // Enter sends, Shift+Enter adds a line.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(draft);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="flex-row items-center justify-between border-b pr-12">
          <div className="flex items-center gap-3">
            <AssistantLogo className="size-8" />
            <div className="flex flex-col gap-0.5">
              <SheetTitle>{t('assistant.title')}</SheetTitle>
              <SheetDescription>{t('assistant.description')}</SheetDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label={t('assistant.newChat')} onClick={handleNewChat} disabled={isSending}>
            <SquarePen />
          </Button>
        </SheetHeader>

        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport className="px-4">
              <MessageScrollerContent className="gap-6 py-5">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-5 pt-8 text-center animate-in fade-in zoom-in-95 duration-500">
                    <AssistantLogo mode="intro" className="size-16" />
                    <p className="max-w-xs text-sm text-muted-foreground">{t('assistant.empty')}</p>
                    {/* Clickable prompts: one click sends the question */}
                    <div className="flex w-full flex-col gap-2">
                      {SUGGESTIONS.map((key, i) => (
                        <Button
                          key={key}
                          variant="outline"
                          className="h-auto justify-start whitespace-normal py-2 text-left font-normal animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500"
                          style={{ animationDelay: `${150 + i * 80}ms` }}
                          onClick={() => send(t(key))}
                        >
                          {t(key)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map(m => (
                  <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === 'user'}>
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      {m.role === 'user' ? (
                        <Message align="end">
                          <MessageContent>
                            <Bubble align="end">
                              <BubbleContent className="whitespace-pre-wrap">{m.text}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      ) : (
                        <AssistantReply message={m} onTraceOpenChange={(open) => updateMessage(m.id, x => ({ ...x, isTraceOpen: open }))} />
                      )}
                    </div>
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        <div className="border-t p-3">
          <InputGroup>
            <InputGroupTextarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('assistant.placeholder')}
              aria-label={t('assistant.placeholder')}
              maxLength={2000}
              rows={1}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                variant="default"
                className="rounded-full transition-transform active:scale-90"
                aria-label={t('assistant.send')}
                onClick={() => send(draft)}
                disabled={!draft.trim() || isSending}
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}
