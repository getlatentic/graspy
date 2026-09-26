# graspy for Android

The native Android app: Kotlin and Jetpack Compose, with Room, WorkManager and Retrofit. It has the web app's screens and uses the same API, sign-in and learners (`apps/server`). It is a Gradle project, not an npm workspace, so `npm run dev`, `test` and `lint` skip it.

## Set up

Needs JDK 17 and the Android SDK (`local.properties` with `sdk.dir`, or `ANDROID_HOME`).

The Firebase config is not in git. Copy it in before the first build:

```bash
cp ~/.config/graspy/google-services.json apps/mobile/app/
```

It is the Android app of the Firebase project `graspy-f482e`, the project the API accepts sign-ins from. Git ignores `app/google-services.json`.

Without it, copy the stand-in for the Auth emulator's `demo-graspy` project instead. It builds the app and runs the tests, as CI does; signing in against the live API needs the real file.

```bash
cp apps/mobile/google-services.stand-in.json apps/mobile/app/google-services.json
```

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

## Release

```bash
apps/mobile/scripts/release.sh
```

It builds the signed bundle (`app/build/outputs/bundle/release/app-release.aab`) and APK with the release key, `~/.config/graspy/signing/graspy-release.jks` (alias `graspy`, backed up in iCloud Drive under `graspy-release`). The password comes from the Keychain item `graspy-release-keystore` into Gradle's environment only. Elsewhere, set `GRASPY_RELEASE_STORE_FILE`, `GRASPY_RELEASE_KEY_ALIAS` and `GRASPY_RELEASE_STORE_PASSWORD` as environment variables or Gradle properties outside the repository. Without them a release build stops; it is never built unsigned or with the debug key. Certificate SHA-1 `56:7C:36:8A:AA:8F:E7:40:1B:E3:06:18:86:1C:47:8B:58:B1:E4:78`.

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

Lesson and practice views need the API to allow `https://graspy.getlatentic.com` as a host (its `CORS_ORIGINS`); without it they show "This card could not be shown."

## Design tokens

Colours, type, radii and spacing come from [content/design/tokens.json](../../content/design/tokens.json), shared with the web. After changing it, run `node content/design/build.mjs` from the repository root: it writes `ui/GraspyTokens.kt`, `res/values/graspy_tokens.xml` and the web's `src/design/tokens.css`. `GraspyTokensTest` fails while they are stale. Fonts are Poppins for headings and Inter for text, both under the SIL Open Font Licence (`assets/licenses/`).

## Views (MCP Apps)

A lesson, and a practice card from the tutor, are the server's MCP Apps views, shown as the web shows them. `mcp/HostPage.kt` serves a host page from the app at `https://graspy.getlatentic.com/app-host/`, refusing every other address on that origin; the page frames the API's sandbox proxy and passes its messages to the app, which answers them in `mcp/ViewSession.kt` and calls tools on `/mcp` as the learner. Only that page, in the main frame, relaying a frame on the API's origin, reaches the app (`mcp/HostGate.kt`).

## Plans, Ask and the tutor's replies

- A learner with no plan makes one first, as on the web: country, language and class, then subjects, then the plan streamed from `/api/curriculum/generate-stream` and kept with `PUT /api/learner/curriculum`. The plan decides the app's words and, for a Nigerian primary class, the voice lessons' class and language.
- Ask keeps a conversation per topic, subject or general question in Room, as the web keeps them in IndexedDB. View calls made with no connection are kept and sent once there is one.
- The tutor's replies are drawn by `assets/app-host/reply.html` with marked and KaTeX, copied from the repository's `node_modules` by `node apps/mobile/scripts/vendor-reply.mjs`.

## How accounts work on the phone

- Signing in exchanges the Firebase ID token for a graspy session (`POST /api/session`). The session is kept in memory, sent on every call, and exchanged again on a `401`.
- The account's learners are chosen on "Who's learning?". The first choice after signing in takes what the phone learned before; a later choice sends the unsent recordings, wipes the learner's data and takes up the new learner.
- Everything a learner keeps on the phone is keyed by their learner key, `<uid>/<learner id>`. Their class and language stay on the phone when another learner is chosen, so switching back restores them.
- Signing out wipes the phone and gives it a new device id.
