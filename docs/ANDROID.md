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

Planned next:

- Google login: the OAuth redirect must come back through the custom URL scheme
  `com.dartlead.app` (see `android/app/src/main/res/values/strings.xml`) and be
  allowed in Supabase Auth → URL configuration. Email/password login already
  works unchanged.
- Keep screen awake on the match screen and haptic feedback on the keypad
  (Capacitor plugins, guarded by the same switch).

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
