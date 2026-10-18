import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { parseSpokenScore, speechLocale } from '../lib/voiceScore';

const WebRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// Push-to-talk: tap, say "140" / "stoštyridsať" / "bust" / "ok", it stops by
// itself. Native shell uses Android's recogniser (the WebView has no Web
// Speech API); browsers use SpeechRecognition where it exists (Chrome, Edge).
// onResult gets { score } or { command: 'submit' }; unparsable speech is
// reported as onResult(null) so the UI can flash "didn't catch that".
export function useVoiceScore({ lang, onResult }) {
  const isNative = Capacitor.isNativePlatform();
  const isSupported = isNative || Boolean(WebRecognition);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const deliver = useCallback((matches) => {
    const hit = matches.map(m => parseSpokenScore(m, lang)).find(Boolean) || null;
    onResultRef.current?.(hit);
  }, [lang]);

  const start = useCallback(async () => {
    if (isListening) return;
    if (isNative) {
      try {
        const { speechRecognition } = await SpeechRecognition.requestPermissions();
        if (speechRecognition !== 'granted') return;
        setIsListening(true);
        const { matches = [] } = await SpeechRecognition.start({ language: speechLocale(lang), maxResults: 3, partialResults: false, popup: false });
        deliver(matches);
      } catch {
        // Cancelled or recogniser error: treat as nothing heard.
      } finally {
        setIsListening(false);
      }
      return;
    }
    const recognition = new WebRecognition();
    recognitionRef.current = recognition;
    recognition.lang = speechLocale(lang);
    recognition.maxAlternatives = 3;
    recognition.interimResults = false;
    recognition.onresult = (e) => deliver(Array.from(e.results[0]).map(r => r.transcript));
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    setIsListening(true);
    recognition.start();
  }, [isListening, isNative, lang, deliver]);

  const stop = useCallback(() => {
    if (isNative) SpeechRecognition.stop().catch(() => {});
    else recognitionRef.current?.abort();
    setIsListening(false);
  }, [isNative]);

  useEffect(() => stop, [stop]);

  return { isSupported, isListening, start, stop };
}
