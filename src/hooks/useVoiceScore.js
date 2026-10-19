import { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { parseSpokenScore, speechLocale } from '../lib/voiceScore';

const WebRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const isNative = Capacitor.isNativePlatform();
const QUICK_MS = 1500;      // a listen shorter than this heard nothing real
const RESTART_MS = 300;
const MAX_BACKOFF_MS = 4000;
const MAX_FAILURES = 5;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// One phrase per listen: { matches, error } with error null | 'silence' |
// 'denied' | 'other'. Silence is the normal outcome while darts are thrown.
const listenNative = async (lang) => {
  try {
    const { matches = [] } = await SpeechRecognition.start({ language: speechLocale(lang), maxResults: 3, partialResults: false, popup: false });
    return { matches, error: null };
  } catch (e) {
    const message = String(e?.message || e);
    if (/no match|no speech/i.test(message)) return { matches: [], error: 'silence' };
    if (/permission/i.test(message)) return { matches: [], error: 'denied' };
    return { matches: [], error: 'other' };
  }
};

const listenWeb = (lang, holder) => new Promise((resolve) => {
  const recognition = new WebRecognition();
  holder.recognition = recognition;
  recognition.lang = speechLocale(lang);
  recognition.maxAlternatives = 3;
  recognition.interimResults = false;
  let matches = [];
  let error = null;
  recognition.onresult = (e) => { matches = Array.from(e.results[0]).map(a => a.transcript); };
  recognition.onerror = (e) => {
    error = e.error === 'no-speech' || e.error === 'aborted' ? 'silence' : e.error === 'not-allowed' ? 'denied' : 'other';
  };
  recognition.onend = () => resolve({ matches, error: matches.length ? null : (error || 'silence') });
  try { recognition.start(); } catch { resolve({ matches: [], error: 'other' }); }
});

const ensurePermission = async () => {
  if (!isNative) return true;
  try {
    let { speechRecognition } = await SpeechRecognition.checkPermissions();
    if (speechRecognition !== 'granted') ({ speechRecognition } = await SpeechRecognition.requestPermissions());
    return speechRecognition === 'granted';
  } catch {
    return false;
  }
};

// Hands-free scoring: while `enabled` and `active` (the keypad accepts
// input), listen for one phrase at a time and hand every recognised score to
// onResult. Android's recogniser ends each listen after a pause, so it is
// started again until the player speaks; listens that die at once back off
// so a failing recogniser cannot loop. Five failures in a row (no recogniser,
// microphone refused) call onGiveUp. Android beeps at every start and stop.
export function useVoiceScore({ lang, enabled, active, onResult, onGiveUp }) {
  const isSupported = isNative || Boolean(WebRecognition);
  const [isListening, setIsListening] = useState(false);
  const callbacks = useRef({ onResult, onGiveUp });
  callbacks.current = { onResult, onGiveUp };

  useEffect(() => {
    if (!enabled || !active || !isSupported) return undefined;
    let alive = true;
    const web = { recognition: null }; // the browser listen in progress

    (async () => {
      if (!(await ensurePermission())) {
        if (alive) callbacks.current.onGiveUp?.();
        return;
      }
      setIsListening(true);
      let failures = 0;
      let quickEnds = 0;
      while (alive) {
        const startedAt = Date.now();
        const { matches, error } = isNative ? await listenNative(lang) : await listenWeb(lang, web);
        if (!alive) return;
        const hit = matches.map(m => parseSpokenScore(m, lang)).find(Boolean);
        if (hit) callbacks.current.onResult?.(hit);

        failures = error === 'denied' ? MAX_FAILURES : error === 'other' ? failures + 1 : 0;
        if (failures >= MAX_FAILURES) {
          setIsListening(false);
          callbacks.current.onGiveUp?.();
          return;
        }
        const quick = Date.now() - startedAt < QUICK_MS && !matches.length;
        quickEnds = quick ? quickEnds + 1 : 0;
        await sleep(quick ? Math.min(500 * 2 ** (quickEnds - 1), MAX_BACKOFF_MS) : RESTART_MS);
      }
    })();

    return () => {
      alive = false;
      if (isNative) SpeechRecognition.stop().catch(() => {});
      else web.recognition?.abort();
      setIsListening(false);
    };
  }, [enabled, active, isSupported, lang]);

  return { isSupported, isListening };
}
