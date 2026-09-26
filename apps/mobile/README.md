# graspy for Android

The native Android app: Kotlin and Jetpack Compose, with Room, WorkManager and Retrofit. It has the web app's screens and uses the same API, sign-in and learners (`apps/server`). It is a Gradle project, not an npm workspace, so `npm run dev`, `test` and `lint` skip it.

## Set up

Needs JDK 17 and the Android SDK (`local.properties` with `sdk.dir`, or `ANDROID_HOME`).

The Firebase config is not in git. Copy it in before the first build:

```bash
cp ~/.config/graspy/google-services.json apps/mobile/app/
```

It is the Android app of the Firebase project `graspy-f482e`, the project the API accepts sign-ins from. Git ignores `app/google-services.json`.

## Build and check

```bash
cd apps/mobile
./gradlew testDebugUnitTest lintDebug assembleDebug
```

| Gradle property | Default | Purpose |
|---|---|---|
| `GRASPY_API_BASE_URL` | `https://graspy-api.getlatentic.com/` | The API. Keep the trailing slash |
| `GRASPY_AUTH_EMULATOR` | empty | Debug builds only: `host:port` of Firebase's Auth emulator |

Unit tests run on the JVM. Tests that need Android (Room, preferences, files) run under Robolectric, which downloads its Android jars on the first run.

## Run against a local API

Voice lessons run only on the Worker, so the local API answers `503` for them; signing in, choosing a learner and managing learners work. Start the Auth emulator and the API from the repository root, as for the web app ([docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)):

```bash
npx firebase-tools@15.31.0 emulators:start --only auth --project demo-graspy
cd apps/server && uv run serve
```

Then build for the Android emulator, which reaches the computer at `10.0.2.2`:

```bash
./gradlew installDebug -PGRASPY_API_BASE_URL=http://10.0.2.2:8081/ -PGRASPY_AUTH_EMULATOR=10.0.2.2:9099
```

"Sign in with Google" then signs in as a made-up account, `parent@example.com`, with no Google account on the device.

## How accounts work on the phone

- Signing in exchanges the Firebase ID token for a graspy session (`POST /api/session`). The session is kept in memory, sent on every call, and exchanged again on a `401`.
- The account's learners are chosen on "Who's learning?". The first choice after signing in takes what the phone learned before; a later choice sends the unsent recordings, wipes the learner's data and takes up the new learner.
- Everything a learner keeps on the phone is keyed by their learner key, `<uid>/<learner id>`. Their class and language stay on the phone when another learner is chosen, so switching back restores them.
- Signing out wipes the phone and gives it a new device id.
