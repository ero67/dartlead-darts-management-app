import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { parseSpokenScore, speechLocale } from '../lib/voiceScore';

const WebRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const RESTART_MS = 400;
const QUICK_END_MS = 1500;
const MAX_QUICK_ENDS = 5;

// Hands-free scoring: while `enabled`, keep a recogniser session open and
// start a fresh one whenever the device ends it (silence, timeout, error), so
// the scorer never has to tap for the next visit. Native shell uses Android's
// recogniser with streaming partial results (the WebView has no Web Speech
// API); browsers use SpeechRecognition where it exists. onResult gets the
// parse of every transcript; a submit restarts the session so the next visit
// begins with an empty transcript. onGiveUp fires after several sessions in a
// row died at once with nothing heard (no recogniser, mic refused).
export function useVoiceScore({ lang, enabled, onResult, onGiveUp }) {
  const isNative = Capacitor.isNativePlatform();
  const isSupported = isNative || Boolean(WebRecognition);
  const [isListening, setIsListening] = useState(false);
  const wantedRef = useRef(false);
  const webRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const heardRef = useRef(false);
  const quickEndsRef = useRef(0);
  const callbacks = useRef({ onResult, onGiveUp });
  callbacks.current = { onResult, onGiveUp };
  const startSessionRef = useRef(null); // latest startSession, for the restart timer

  const stopSession = useCallback(() => {
    clearTimeout(timerRef.current);
    if (isNative) SpeechRecognition.stop().catch(() => {});
    else { webRef.current?.abort(); webRef.current = null; }
    setIsListening(false);
  }, [isNative]);

  // The session ended (device, error or our restart): run another if wanted.
  const sessionEnded = useCallback(() => {
    setIsListening(false);
    if (!wantedRef.current) return;
    const quick = !heardRef.current && Date.now() - startedAtRef.current < QUICK_END_MS;
    quickEndsRef.current = quick ? quickEndsRef.current + 1 : 0;
    if (quickEndsRef.current >= MAX_QUICK_ENDS) {
      wantedRef.current = false;
      callbacks.current.onGiveUp?.();
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => startSessionRef.current?.(), RESTART_MS);
  }, []);

  const deliver = useCallback((matches) => {
    if (!wantedRef.current) return;
    const hit = matches.map(m => parseSpokenScore(m, lang)).find(Boolean) || null;
    if (!hit) return;
    heardRef.current = true;
    callbacks.current.onResult?.(hit);
    // Transcripts accumulate within a session: start clean after a submit.
    if (hit.submit || hit.command === 'submit') stopSession();
  }, [lang, stopSession]);

  const startSession = useCallback(async () => {
    if (!wantedRef.current) return;
    startedAtRef.current = Date.now();
    heardRef.current = false;
    if (isNative) {
      try {
        let { speechRecognition } = await SpeechRecognition.checkPermissions();
        if (speechRecognition !== 'granted') ({ speechRecognition } = await SpeechRecognition.requestPermissions());
        if (speechRecognition !== 'granted') { wantedRef.current = false; callbacks.current.onGiveUp?.(); return; }
        await SpeechRecognition.start({ language: speechLocale(lang), maxResults: 3, partialResults: true, popup: false });
        setIsListening(true);
      } catch {
        sessionEnded();
      }
      return;
    }
    const recognition = new WebRecognition();
    webRef.current = recognition;
    recognition.lang = speechLocale(lang);
    recognition.maxAlternatives = 3;
    recognition.interimResults = true;
    recognition.onresult = (e) => deliver(Array.from(e.results[e.results.length - 1]).map(r => r.transcript));
    recognition.onend = () => { if (webRef.current === recognition) webRef.current = null; sessionEnded(); };
    recognition.onerror = () => {};
    try { recognition.start(); setIsListening(true); } catch { sessionEnded(); }
  }, [isNative, lang, deliver, sessionEnded]);
  startSessionRef.current = startSession;

  // Native events: streamed transcripts and the recogniser's own stop.
  useEffect(() => {
    if (!isNative) return undefined;
    const handles = [
      SpeechRecognition.addListener('partialResults', ({ matches = [] }) => deliver(matches)),
      SpeechRecognition.addListener('listeningState', ({ status }) => { if (status === 'stopped') sessionEnded(); })
    ];
    return () => { handles.forEach(h => h.then(x => x.remove())); };
  }, [isNative, deliver, sessionEnded]);

  useEffect(() => {
    wantedRef.current = Boolean(enabled && isSupported);
    quickEndsRef.current = 0;
    if (wantedRef.current) startSession();
    else stopSession();
    return () => { wantedRef.current = false; stopSession(); };
  }, [enabled, isSupported, startSession, stopSession]);

  return { isSupported, isListening };
}
