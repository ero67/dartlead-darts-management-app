import { useState, useRef, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createSpeechReader, speechLocale } from '../lib/voiceScore';

// Native side: android/app/src/main/java/com/dartlead/app/VoiceScorePlugin.java
const VoiceScore = registerPlugin('VoiceScore');
const WebRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const isNative = Capacitor.isNativePlatform();
const RESTART_MS = 250;
const QUICK_END_MS = 1500;
const MAX_QUICK_ENDS = 5;

// Hands-free scoring. While `enabled`, one listening session stays open for
// the whole game: the native plugin and the browser branch below restart the
// recogniser themselves when the device ends it, without the UI ever seeing
// it stop. Speech is applied only while `active` (keypad enabled); during a
// bot's visit or a bust flash it is heard and dropped, never by closing the
// microphone. Growing transcripts are read by createSpeechReader.
export function useVoiceScore({ lang, enabled, active, onResult, onGiveUp }) {
  const isSupported = isNative || Boolean(WebRecognition);
  const [isListening, setIsListening] = useState(false);
  const readerRef = useRef(null);
  if (!readerRef.current) readerRef.current = createSpeechReader();
  const handleSpeechRef = useRef(null);
  const onGiveUpRef = useRef(onGiveUp);
  onGiveUpRef.current = onGiveUp;

  handleSpeechRef.current = (type, matches) => {
    const hit = readerRef.current(type, matches, { lang, active });
    if (hit) onResult?.(hit);
  };

  useEffect(() => {
    if (!enabled || !isSupported) return undefined;
    readerRef.current.reset();
    const deliver = (type, matches) => handleSpeechRef.current(type, matches);
    const giveUp = () => { setIsListening(false); onGiveUpRef.current?.(); };

    if (isNative) {
      let disposed = false;
      const handles = [
        VoiceScore.addListener('speech', ({ type, matches = [] }) => deliver(type, matches)),
        VoiceScore.addListener('state', ({ listening, error }) => {
          if (disposed) return;
          if (error) giveUp();
          else setIsListening(listening);
        })
      ];
      Promise.all(handles)
        .then(() => (disposed ? null : VoiceScore.start({ language: speechLocale(lang) })))
        .catch(() => { if (!disposed) giveUp(); });
      return () => {
        disposed = true;
        handles.forEach(h => h.then(x => x.remove()).catch(() => {}));
        VoiceScore.stop().catch(() => {});
        setIsListening(false);
      };
    }

    // Browser: continuous mode, restarted whenever the browser ends it.
    let wanted = true;
    let recognition = null;
    let timer = null;
    let startedAt = 0;
    let heard = false;
    let quickEnds = 0;
    const startWeb = () => {
      if (!wanted) return;
      recognition = new WebRecognition();
      recognition.lang = speechLocale(lang);
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.onresult = (e) => {
        heard = true;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          deliver(r.isFinal ? 'final' : 'partial', Array.from(r).map(a => a.transcript));
        }
      };
      recognition.onerror = () => {};
      recognition.onend = () => {
        if (!wanted) return;
        const quick = !heard && Date.now() - startedAt < QUICK_END_MS;
        quickEnds = quick ? quickEnds + 1 : 0;
        if (quickEnds >= MAX_QUICK_ENDS) { wanted = false; giveUp(); return; }
        readerRef.current.reset();
        timer = setTimeout(startWeb, RESTART_MS);
      };
      startedAt = Date.now();
      heard = false;
      try {
        recognition.start();
        setIsListening(true);
      } catch {
        recognition.onend();
      }
    };
    startWeb();
    return () => {
      wanted = false;
      clearTimeout(timer);
      recognition?.abort();
      setIsListening(false);
    };
  }, [enabled, isSupported, lang]);

  return { isSupported, isListening };
}
