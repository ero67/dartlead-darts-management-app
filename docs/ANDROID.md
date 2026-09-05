# Android app (Capacitor)

The Android app is the same React build wrapped in a native shell with
[Capacitor](https://capacitorjs.com). Nothing about the web app changes: Vercel
keeps deploying `dist/` on every push, and the Android project in `android/`
packages that same `dist/` for Google Play. Both talk to the same Supabase
project, so tournaments, scores and accounts are shared.

## Prerequisites (developer machine)

- Android Studio (Ladybug or newer) with the Android SDK, platform 36.
- JDK 21 (Capacitor 8 compiles against Java 21). Android Studio ships one.
- Node 20+ and the repo's `npm install`.

Nothing else is needed in WSL itself; open the `android/` folder from Android
Studio on Windows through the `\\wsl$` path, or clone the repo on the Windows
side.

## Everyday workflow

```bash
npm run android:sync     # production web build + copy into android/
npm run android:open     # open the project in Android Studio
```

Then run on a device or emulator from Android Studio. Repeat `android:sync`
after every web change you want to see in the app.

## After a fresh clone

Two kinds of binary build inputs are intentionally not in git (organisation
policy); both are regenerated:

```bash
npm run android:assets   # launcher icons + splash screens from public/pwa-maskable-512x512.png
```

`android/gradle/wrapper/gradle-wrapper.jar` is restored by Android Studio on
first sync (it downloads the Gradle version pinned in
`android/gradle/wrapper/gradle-wrapper.properties`). On a plain CLI machine run
`gradle wrapper` once inside `android/` with any locally installed Gradle.

## What differs from the web build

`Capacitor.isNativePlatform()` (from `@capacitor/core`) is the single switch.
Only these places branch on it:

- `src/contexts/OfflineContext.jsx` — no service-worker registration or update
  polling in the shell; the bundle ships with the app.
- `src/contexts/AuthContext.jsx` + `src/lib/nativeAuth.js` — Google login opens
  the system browser and returns through the deep link
  `com.dartlead.app://auth/callback` (intent filter in `AndroidManifest.xml`,
  scheme in `res/values/strings.xml`). That URL must be listed under
  Supabase → Authentication → URL Configuration → Redirect URLs. Email/password
  login is unchanged.

- `src/contexts/ThemeContext.jsx` — status-bar icon style follows the theme
  (`@capacitor/status-bar`). Android 15+ is edge-to-edge, so the bar's colour is
  the page background; `.app` pads by the injected `--safe-area-inset-*`.
- `src/hooks/useKeepScreenAwake.js` — match screen keeps the display on
  (`@capacitor-community/keep-awake`; Screen Wake Lock API in browsers).
- `src/utils/publicUrl.js` — share links and password-reset emails use
  `VITE_PUBLIC_APP_URL` (the website's address) instead of the shell's local
  origin. Put it in `.env.production.local` next to the Supabase variables.

Planned next:

- Haptic feedback on the keypad.

## Identity

- Application id: `com.dartlead.app` — cannot change once published on Play.
- App name: `DartLead` (`android/app/src/main/res/values/strings.xml`).
- Config: `capacitor.config.json` at the repo root.

## Releasing

Not set up yet. Needs a signing keystore (never commit it — `android/app/*.jks`
and `*.keystore` are gitignored), a Play Console account, and the store
listing. Updates ship via the store, so a web-only fix does not reach Android
users until a new version is published; everything server-side (RLS, RPCs,
league scoring) applies to both immediately.
