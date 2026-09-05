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

- `src/lib/haptics.js` — keypad tap / bust / leg / match feedback on the match
  screen (`@capacitor/haptics`); intentionally silent in browsers. Strength is a
  per-device choice in Device Settings (off / light / medium / strong).
- Device Settings also shows the build identity: `package.json` version plus
  the short commit (`__APP_VERSION__` / `__BUILD_SHA__`, defined in
  `vite.config.js`). Bump `version` in `package.json` and `versionName` /
  `versionCode` in `android/app/build.gradle` together for a store release.

Planned next:

- Push notifications (needs FCM + a server-side sender).

## Identity

- Application id: `com.dartlead.app` — cannot change once published on Play.
- App name: `DartLead` (`android/app/src/main/res/values/strings.xml`).
- Config: `capacitor.config.json` at the repo root.

## Continuous builds (GitHub Actions)

`.github/workflows/android.yml` builds the app on every push to `main` and
publishes the APK to a rolling GitHub Release:

- Stable link to the newest build:
  `https://github.com/ero67/dartlead-darts-management-app/releases/download/android-latest/DartLead.apk`
- Release page (also shows version, commit and how it was signed):
  `https://github.com/ero67/dartlead-darts-management-app/releases/tag/android-latest`
- Each run also keeps a `DartLead-<version>.apk` artifact for 30 days.

Version: `versionName` = `package.json` version + `+<run number>.<short sha>`,
`versionCode` = the workflow run number (always increasing, so installs upgrade).

### One-time setup — repository secrets

GitHub → repository → Settings → Secrets and variables → Actions:

| Secret                      | What                                            |
|-----------------------------|-------------------------------------------------|
| `VITE_SUPABASE_ANON_KEY`    | anon key of the production project (required)   |
| `ANDROID_KEYSTORE_BASE64`   | signing keystore, base64 (recommended, see below) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password                               |
| `ANDROID_KEY_ALIAS`         | key alias (e.g. `dartlead`)                      |
| `ANDROID_KEY_PASSWORD`      | key password                                    |

Optional variables `VITE_SUPABASE_URL` and `VITE_PUBLIC_APP_URL` override the
defaults baked into the workflow.

### Signing key

Without the keystore secrets the workflow signs with a throw-away debug key,
so a newer build cannot be installed over an older one (uninstall first). With
a fixed key every build upgrades in place, and the same key becomes the Play
Store *upload key* later. Generate it once (PowerShell, using Android Studio's
bundled JDK), keep the `.jks` and both passwords in a password manager, never
commit it (`*.jks` is gitignored):

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore dartlead-upload.jks -alias dartlead -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("dartlead-upload.jks")) | Set-Clipboard
```

The clipboard now holds the value for `ANDROID_KEYSTORE_BASE64`.

## Play Store release

Still to do: Play Console account, listing (SK/EN), screenshots, feature
graphic, content rating and data-safety forms, a public privacy policy URL.
The workflow can then be extended with `bundleRelease` (AAB) and a Play upload
step. Updates ship via the store, so a web-only fix does not reach Android
users until a new version is published; everything server-side (RLS, RPCs,
league scoring) applies to both immediately.
