package com.dartlead.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Hands-free score entry (src/hooks/useVoiceScore.js). Android's recogniser
 * normally hears one utterance and stops, with a beep at each start and end.
 * This keeps one session alive for as long as the JS side wants it:
 *  - Android 13+: a segmented session that runs for minutes and reports each
 *    utterance as a segment, so the microphone stays open between visits.
 *  - Older devices / recognisers that ignore segmentation: the session is
 *    restarted the moment it ends, with media muted around the restart so the
 *    start/end beeps are not heard.
 * The restarts are invisible to JS: "state" only reports listening=false when
 * stop() is called or the recogniser keeps failing.
 *
 * Events: "speech" {type: "partial"|"final", matches: string[]}, "state"
 * {listening: boolean, error?: "permission"|"failed"}.
 */
@CapacitorPlugin(
    name = "VoiceScore",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class VoiceScorePlugin extends Plugin {

    private static final long SESSION_MS = 5 * 60 * 1000L;
    private static final long QUICK_FAIL_MS = 1500L;
    private static final int MAX_QUICK_FAILS = 5;
    private static final long UNMUTE_AFTER_READY_MS = 700L;
    private static final long MUTE_LIMIT_MS = 3000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable unmute = this::unmuteBeep;
    private final Runnable relisten = () -> listen(true);

    private SpeechRecognizer recognizer;
    private String language = "en-GB";
    private boolean wanted = false;
    private boolean useOnDevice = false;
    private boolean listening = false;
    private boolean muted = false;
    private boolean heard = false;
    private long startedAt = 0;
    private int quickFails = 0;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneResult");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphoneResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) begin(call);
        else call.reject("permission", "permission");
    }

    private void begin(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("unavailable", "unavailable");
            return;
        }
        final String lang = call.getString("language", "en-GB");
        main.post(() -> {
            language = lang;
            wanted = true;
            quickFails = 0;
            // On-device recognition is what supports segmented sessions; falls
            // back to the cloud recogniser if it fails (e.g. no Slovak model).
            useOnDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            listen(false);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            wanted = false;
            teardown();
            unmuteBeep();
            setListening(false, null);
            call.resolve();
        });
    }

    // Android cuts the microphone of a backgrounded app anyway; pick up again on return.
    @Override
    protected void handleOnPause() {
        main.post(() -> {
            teardown();
            unmuteBeep();
        });
    }

    @Override
    protected void handleOnResume() {
        main.post(() -> {
            if (wanted && recognizer == null) listen(false);
        });
    }

    @Override
    protected void handleOnDestroy() {
        wanted = false;
        teardown();
        unmuteBeep();
    }

    private void listen(boolean quiet) {
        teardown();
        if (!wanted) return;
        Context ctx = getContext();
        if (quiet) muteBeep();
        recognizer = useOnDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            ? SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
            : SpeechRecognizer.createSpeechRecognizer(ctx);
        recognizer.setRecognitionListener(new Listener(recognizer));

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.getPackageName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, SESSION_MS);
        }
        startedAt = SystemClock.elapsedRealtime();
        heard = false;
        recognizer.startListening(intent);
    }

    private void restart(long delayMs) {
        main.removeCallbacks(relisten);
        if (wanted) main.postDelayed(relisten, delayMs);
    }

    private void teardown() {
        main.removeCallbacks(relisten);
        if (recognizer == null) return;
        SpeechRecognizer r = recognizer;
        recognizer = null;
        try {
            r.cancel();
            r.destroy();
        } catch (Exception ignored) {
            // Already gone.
        }
    }

    private void giveUp(String reason) {
        wanted = false;
        teardown();
        unmuteBeep();
        setListening(false, reason);
    }

    private void setListening(boolean value, String error) {
        if (listening == value && error == null) return;
        listening = value;
        JSObject ret = new JSObject();
        ret.put("listening", value);
        if (error != null) ret.put("error", error);
        notifyListeners("state", ret);
    }

    private void emit(String type, Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null) matches = new ArrayList<>();
        boolean hasText = !matches.isEmpty() && matches.get(0) != null && !matches.get(0).trim().isEmpty();
        if (hasText) {
            heard = true;
            quickFails = 0;
        } else if ("partial".equals(type)) {
            return;
        }
        // A final with no text still marks the end of an utterance for JS.
        JSObject ret = new JSObject();
        ret.put("type", type);
        ret.put("matches", new JSArray(matches));
        notifyListeners("speech", ret);
    }

    // ponytail: muting STREAM_MUSIC is where the Google recogniser plays its
    // beeps on current Pixels; if a device beeps on another stream, add it here.
    private void muteBeep() {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return;
        if (!muted) {
            try {
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, 0);
                muted = true;
            } catch (SecurityException ignored) {
                return;
            }
        }
        main.removeCallbacks(unmute);
        main.postDelayed(unmute, MUTE_LIMIT_MS);
    }

    private void unmuteBeep() {
        main.removeCallbacks(unmute);
        if (!muted) return;
        muted = false;
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return;
        try {
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0);
        } catch (SecurityException ignored) {
            // Nothing else to restore.
        }
    }

    private class Listener implements RecognitionListener {
        private final SpeechRecognizer owner;

        Listener(SpeechRecognizer owner) {
            this.owner = owner;
        }

        // Callbacks from a recogniser we already replaced are ignored.
        private boolean stale() {
            return owner != recognizer;
        }

        @Override
        public void onReadyForSpeech(Bundle params) {
            if (stale()) return;
            setListening(true, null);
            if (muted) {
                main.removeCallbacks(unmute);
                main.postDelayed(unmute, UNMUTE_AFTER_READY_MS);
            }
        }

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEvent(int eventType, Bundle params) {}

        // A one-shot session beeps when it stops listening: mute before that.
        @Override
        public void onEndOfSpeech() {
            if (!stale()) muteBeep();
        }

        @Override
        public void onPartialResults(Bundle results) {
            if (!stale()) emit("partial", results);
        }

        // Segmented session: the session goes on, so there is no beep to hide.
        @Override
        public void onSegmentResults(Bundle results) {
            if (stale()) return;
            unmuteBeep();
            emit("final", results);
        }

        @Override
        public void onEndOfSegmentedSession() {
            if (!stale()) restart(0);
        }

        @Override
        public void onResults(Bundle results) {
            if (stale()) return;
            emit("final", results);
            restart(0);
        }

        @Override
        public void onError(int error) {
            if (stale()) return;
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                giveUp("permission");
                return;
            }
            // Silence: the normal end of a quiet one-shot session.
            if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                restart(0);
                return;
            }
            boolean quick = !heard && SystemClock.elapsedRealtime() - startedAt < QUICK_FAIL_MS;
            if (quick && useOnDevice) {
                useOnDevice = false;
                restart(0);
                return;
            }
            quickFails = quick ? quickFails + 1 : 0;
            if (quickFails >= MAX_QUICK_FAILS) {
                giveUp("failed");
                return;
            }
            restart(300);
        }
    }
}
