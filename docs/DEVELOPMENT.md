# Development

## Set up

Needs Node 24 (24.13.1 or a later 24), as CI uses, and [uv](https://docs.astral.sh/uv/). uv installs Python 3.14, the Workers runtime's version.

```bash
npm install
cp apps/server/.env.example apps/server/.env   # then set AWS_BEARER_TOKEN_BEDROCK (or the Workers AI pair)
npm run dev
```

`npm install` also runs `uv sync` for the server. `npm run dev` starts the web app on port 5173 and the API on port 8081 under uvicorn, which reloads on each change. The web app calls port 8081, so leave `PORT` as it is.

Check it: <http://localhost:8081/api/health> answers, <http://localhost:8081/api/docs> lists the routes, and onboarding in the app makes a plan.

Signing in locally goes to Firebase's Auth emulator, under the demo project `demo-graspy`, so no real Google account is involved. Start it beside `npm run dev`:

```bash
npx firebase-tools@15.31.0 emulators:start --only auth --project demo-graspy
```

Its sign-in window lets you make up a Google account.

A parent's consent is kept only in the Worker (D1), so under `npm run dev` adding a learner in the web app answers `503 consent_unavailable`. Run the Worker (see below) and point `VITE_API_URL` at it in `apps/web/.env.local` to add learners and try the voice recordings page.

## Configure

The server's environment holds only what changes between deployments or is secret. Generation settings (temperature, token budgets) are in `apps/server/src/app/config/generation.py`, next to the prompts they tune.

| Variable | Purpose |
|---|---|
| `LLM_PROFILE` | A named model from `apps/server/src/app/llm/profiles.py`, which keeps a host, model id and base URL together: `gpt-oss-120b`, `gemma-4-31b` (Bedrock, `/openai/v1` of the us-east-1 mantle host), `gpt-oss-120b-workers-ai`. `LLM_MODEL_ID` and `LLM_BASE_URL`, when set, win over the profile; an `LLM_HOST` that differs from the profile's host stops startup (so with a profile, leave `LLM_HOST` unset; in `wrangler.jsonc` the `LLM_HOST` var must match or be removed in that environment). Unset uses the defaults below. An unknown name stops startup and lists the valid ones. The measurement scripts (`measure_skill_loading.py` and the other `measure_*` scripts that call the model) take `--profile NAME` and print `model: profile=... host=... endpoint=... <model>`, and say when the environment overrode the profile |
| `LLM_HOST` | Where gpt-oss-120b runs: `bedrock` (default) or `workers-ai` |
| `ENGLISH_ASR` | Who hears English in voice lessons: `whisper` (default, Workers AI, with Intron asked when it cannot answer) or `intron`. Yoruba and Pidgin are always heard by Intron |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock's API key. Required for `bedrock`. The Bedrock host and region are set by `LLM_BASE_URL` alone (or by `LLM_PROFILE`). A leftover `AWS_REGION` is ignored and logged once per process as unused, wherever it comes from: the environment, `.env`, or a Worker var (`AWS_REGION` stays in `DEPLOYMENT_KEYS` only so that a Worker var is seen). The tutor Worker (`apps/tutor`) takes `LLM_BASE_URL` too, as an origin only (`https://bedrock-mantle.<region>.api.aws`, no path: it picks `/v1` or `/openai/v1` by model), and logs a leftover `AWS_REGION` once per isolate |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | The account and a token with Workers AI access. Required for `workers-ai` |
| `LLM_NATIVE_TOOLS` | `true` sends the tutor's tools in the request's `tools` array with `tool_choice: auto` and reads `tool_calls` back, instead of the tools as text in the prompt (default, `false`). Off by default: on the measured set (10 draws per case) it called `calculate` 7 times in 10 against 10 in 10, and picked the right skill 6 in 10 against 10 in 10 for a mistake, though its tool steps took about half as long (see `apps/server/scripts/measure_skill_loading.py`) |
| `LLM_MODEL_ID` | Overrides the host's model id. Unset uses the host's gpt-oss-120b |
| `LLM_BASE_URL` | Overrides the host's base URL, for models served on another path of the same host (Bedrock Gemma 4 31B: `https://bedrock-mantle.us-east-1.api.aws/openai/v1`). The API key is sent there, so the hostname must be the host's own (Bedrock: `bedrock-mantle.<region>.api.aws` (region: letters, digits, hyphens); Workers AI: `api.cloudflare.com` with a path under `/client/v4/accounts/<CLOUDFLARE_ACCOUNT_ID>/`, or `gateway.ai.cloudflare.com` under `/v1/<CLOUDFLARE_ACCOUNT_ID>/`, since both hosts serve every account), ASCII only, port 443, https, no credentials, query or fragment; `http://localhost` only outside staging and production. Another host needs its exact name in `LLM_BASE_URL_ALLOW`, which logs a warning. On Bedrock the route keeps lm15's `bedrock-mantle-chat` dialect, region and bearer key: only the URL changes, so the request body is the same as on the default route. Unset uses the host's default (Bedrock: `https://bedrock-mantle.us-east-1.api.aws/v1`). In a Worker, a plain var per environment in `wrangler.jsonc` (not a secret) |
| `LLM_BASE_URL_ALLOW` | The one plain ASCII hostname (no scheme, port, path, list or wildcard), besides the model host's own, that `LLM_BASE_URL` may name; any path is accepted on it |
| `FIREBASE_API_KEY` | The Firebase project's web API key: the project whose sign-ins are accepted. A Worker secret in production. Unset turns sign-in off |
| `FIREBASE_SERVICE_ACCOUNT` | The JSON key of a service account that may delete Firebase users, so deleting an account also removes its Firebase user (email and name). A Worker secret; required in production and staging while `FIREBASE_API_KEY` is set. Locally the Auth emulator is asked instead, and with neither nothing is removed |
| `FIREBASE_AUTH_EMULATOR_HOST` | The Auth emulator's `host:port`, which then checks sign-ins in place of Google. Development only: the server refuses to start with it in production |
| `INTRON_API_KEY` | Intron's speech recognition, which hears the learner in voice lessons. Worker only: `.dev.vars` locally, a secret in production |
| `YARNGPT_API_KEY` | YarnGPT's speech, used only by `scripts/voice/publish_teacher_audio.py` to record the English lines in Idera. In `apps/server/.dev.vars` or the environment of whoever publishes; never a Worker secret, since the Worker does not call YarnGPT |
| `SPITCH_API_KEY` | Spitch's speech synthesis, the teacher's voice in voice lessons. Worker only: `.dev.vars` locally, a secret in production |
| `SESSION_SECRET` | Signs session tokens. Required in production; in development a temporary key is made |
| `CORS_ORIGINS` | Allowed origins, comma-separated or JSON. One wildcard label is allowed; `*` is refused |
| `PUBLIC_BASE_URL` / `A2A_PATH_PREFIX` | The origin the agent card advertises, and the tutor's path (default `/a2a`) |
| `APP_ENV` | `production` or `staging` hides `/api/docs`, requires `SESSION_SECRET` and refuses the Auth emulator |
| `HOST` / `PORT` / `UVICORN_RELOAD` | uvicorn only, read by `uv run serve` |

The web app reads `VITE_API_URL` and `VITE_A2A_BASE` from the committed `apps/web/.env.<mode>` files. Vite writes them into the bundle at build time, and there are no defaults, so a build without them fails instead of pointing at the wrong host.

In development, `apps/web/.env.development` points sign-in at the emulator (`VITE_FIREBASE_AUTH_EMULATOR`, which a production build ignores). A production build needs the Firebase web app's config in `apps/web/.env.production.local`, which git ignores: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`, from the Firebase console under Project settings, Your apps. Without them the app builds and sign-in is hidden.

## Test

```bash
npm test && npm run lint                                  # every npm package
cd apps/web && npm run test:e2e                           # Cypress, with npm run dev and the Auth emulator running
cd apps/mobile && ./gradlew testDebugUnitTest lintDebug   # Android, set up as apps/mobile/README.md says
cd apps/teacher && npm run test:rust && npm run lint:rust # the teacher app's Rust and clippy, on Apple Silicon (graspy-teacher below)
cd apps/server && uv run pytest -m integration            # real model calls, spends tokens
cd apps/server && uv run mutmut run                       # finds tests that check nothing
```

- Changes reach `main` through a pull request. CI (`.github/workflows/ci.yml`) runs the server, web, tutor, admin UI, Android and teacher suites and the teacher's clippy, and a failing job blocks the merge.
- The server's unit tests never call a model. A stand-in model (`tests/stand_in.py`) answers through the real DSPy adapter, and each test reads back what every stage asked.
- The e2e specs stub nothing: a real browser, server and model, and Google's sign-in is the Auth emulator. A full run takes about five minutes.
- `tests/fixtures/slug-corpus.json` is read by both the server and the web app's tests. Both must spell a subject's slug the same way.
- `apps/server/scripts/export_thread_contract.py` writes what a device sends of its tutor conversations and what the server returns into the web app's and the Android app's tests. After a change to `app/threads/wire.py`, run it; both apps' tests fail until they send and read the new shape.
- `apps/server/scripts/voice/turn_baseline.py` reads one D1 database with SELECT only and prints the voice turns' counts, verdicts and times for a date range. [Voice turn baseline](VOICE_TURN_BASELINE.md) has the baselines taken with it.
- `apps/web/src/lib/csp.test.ts` fails with the new hash when the inline script in `index.html` changes. Put that hash in `public/_headers`.
- A surviving mutant in `src/app/security/` or the calculator is a missing test.
- Check dependencies with `npm audit` from the repository root, which covers every app's npm packages and dev tooling in `package-lock.json`, and in `apps/server` with `uv run pip-audit --locked .` (what the Worker ships, `pylock.toml`) and `uv run pip-audit` (the development environment). The teacher's Rust crates, its llama.cpp build and its data script's `pdfplumber`, Android's Gradle dependencies, firebase-tools (run with `npx`, outside the lockfile) and the actions CI uses are not scanned.

## Run the Worker locally

```bash
cd apps/server
printf 'AWS_BEARER_TOKEN_BEDROCK=%s\nSESSION_SECRET=%s\nAPP_ENV=development\nPUBLIC_BASE_URL=http://127.0.0.1:8799\nCORS_ORIGINS=http://localhost:5173\n' "<key>" "$(openssl rand -hex 32)" > .dev.vars
npm run worker:dev -- --port 8799
```

This runs `workerd` with the rate limits, Durable Objects and views. The first run vendors the Python packages, which takes a minute.

Voice lessons run only here. Add `INTRON_API_KEY` and `SPITCH_API_KEY` to `.dev.vars`, create the local database once, and start the tutor Worker beside the API in a second terminal. The API finds it through the service binding:

```bash
cd apps/server && npx wrangler d1 migrations apply graspy --local
cd apps/tutor && npx wrangler dev --port 8798
```

D1 and R2 are local; Workers AI is remote, so `npx wrangler login` first. Signing in is not available here, so voice is tried as a signed-out device.

## Pedagogy test

`apps/pedagogy` plays a simulated child through a voice lesson in the real web app and keeps the transcript and screenshots for review. It needs the Worker setup above (API, tutor, database, both speech keys), the web app on port 5173 pointed at the Worker (`VITE_API_URL` and `VITE_A2A_BASE` in `apps/web/.env.development.local`), and yarngo studio installed for the child's voice. [Its README](../apps/pedagogy/README.md) has the personas, the checks and how to read a run.

## Build and deploy

Deploy with `scripts/deploy.sh staging|production`. [Deploying](DEPLOYING.md) has the two environments, the order and the one-time setup.

- **Web:** `npm run build` writes `apps/web/dist` using `.env.production`; `npm run build:staging` uses `.env.staging`.
- **Server:** needs the Workers Paid plan, because a lesson needs more than 10 ms of CPU. Each environment's Worker has the secrets `SESSION_SECRET`, `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `INTRON_API_KEY`, `SPITCH_API_KEY` and the host's credentials (`AWS_BEARER_TOKEN_BEDROCK`, or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`), set with `npx wrangler secret put <NAME> --env staging` or `--env=""` for production. The plain values and bindings are in `apps/server/wrangler.jsonc`.
- **Imports that load at startup** grow the Worker's startup snapshot. It has a size cap, and past it a deploy fails with code 10013. Near the cap, the same build can pass or fail, so deploy a change that adds imports three times.
- `pylock.toml` pins what the Worker vendors. `pywrangler` rewrites it when `pyproject.toml` changes. Commit it.

### The web app's launch images

iOS ignores the manifest for the launch screen of an installed app, so `apps/web/public/brand/splash/` holds one JPEG per screen size, linked in `index.html`. `node apps/web/scripts/make-splash.mjs` makes them and writes the links (it needs ImageMagick with WebP and librsvg). `public/sw.js` keeps `/brand` cache-first by path, so a changed image, like a changed icon, needs a new file name: raise `VERSION` in the script when the art or the mark changes, and it renames the set. An installed app keeps the launch image it had until the icon is removed and added again. Not covered: iPhone landscape, and a dark-mode launch image.

## Browser support

The web app runs on **Chromium 108 and newer**, and on the Safari and Firefox versions Tailwind v4 names (Safari 16.4, Firefox 128). Vite's default build target is `chrome111, edge111, firefox114, safari16.4`, and Tailwind v4 emits `@layer`, `@property`, range media queries (`@media (width >= …)`), `dvh` and individual transforms (`translate:`). Chromium 108 has all of these. `color-mix()`, `text-wrap: balance` and oklab gradients come with Chromium 111 and 114; the built CSS guards them with `@supports`, so on 108 only small details are missing (the ring on a selected lesson, one button border, balanced headings).

| Chromium | Samsung Tizen TV | LG webOS TV | Result |
| --- | --- | --- | --- |
| 85 | 2022 | | "Browser too old" notice. No `@layer` (99), and the MCP client's `static {}` blocks do not parse (94). |
| 87 | | webOS 22 | Same as 85. |
| 94 | 2023 | webOS 23 | "Browser too old" notice. No `@layer`, so every style is ignored. |
| 108 | 2024 | webOS 24 | Supported. This is the floor. |
| 120 | 2025 | webOS 25 | Supported (see below). |
| 130 | 2026 | | Supported. |

Google TV, Android TV and Fire TV follow their WebView or browser, so the floor is the same number. The engine versions come from Samsung's and LG's developer pages. The 120 row was not run: Chromium 120 crashes at startup on the Mac the measurement was made on, so it is read from 108 and 130, which both pass.

**The notice.** `index.html` has an inline script that builds a full-screen "This browser is too old for graspy" message, light like the art screens whatever the colour scheme. It shows in two cases. (1) `CSSLayerBlockRule` or `dvh` is missing (Chromium before 108): the notice stays, and `#root` gets `inert` and `aria-hidden` so the page behind it cannot be reached. (2) The window reports a `SyntaxError` from a script under `/assets/` before the app has started and with nothing rendered in `#root`, which is how a browser that passes the checks but cannot parse the entry bundle fails. `src/main.tsx` calls `window.__graspyBooted()` as soon as its imports have all parsed; that takes this notice down and restores `#root`, so a stray error cannot leave it up. Nothing of it exists on a supported browser, so it cannot flash. It is plain ES5 and one script, because the Content-Security-Policy allows the inline script by hash: after editing it, put the hash that `src/lib/csp.test.ts` prints into `public/_headers` and rebuild (the test also checks `dist/index.html` when a build exists).

**Lazy chunks.** A `SyntaxError` inside a lazily imported chunk is a promise rejection, not a window error, and the notice does not react to it: the app's error screen ("Something went wrong") shows instead. Treating it as "too old" would block a supported browser after a transient chunk failure, and the checks above already catch every engine the table lists. On Chromium 85 this is what happened before the notice existed.

**Known gap.** Safari 15.4 to 16.3 and Firefox 101 to 127 pass the two checks but are below the floors Tailwind v4 names (Safari 16.4, Firefox 128), so they get no notice and may render with missing detail. `color-mix()` cannot be the check: it is Chromium 111 and the built CSS guards it with `@supports`, so it would turn away supported Chromium 108.

**Runtime APIs.** Keep calls above Chromium 108 behind a check. `AbortSignal.any` (116) goes through `abortAny` in `src/lib/abort-any.ts`. The built JS also calls `URL.canParse` (120), inside the MCP SDK's OAuth metadata schema; the app does not use that path. Scan the built JS for newer calls before raising a dependency: `Array.fromAsync`, `Promise.withResolvers`, `Object.groupBy`, `toSorted`, the `Set` methods, `URL.canParse`, `AbortSignal.any`.

**Measuring again.** Nothing in the repo launches old browsers; the steps are:

1. `npm run build --workspace @graspy/web`, then `npx vite preview` in `apps/web`.
2. Fetch engines into a scratch folder. Chrome for Testing starts at 113, so older ones are Chromium snapshots: find the revision for a version at `https://chromiumdash.appspot.com/fetch_version?version=<full version>` (`chromium_main_branch_position`), pick the nearest revision below it that exists in the `Mac_Arm` (or `Mac`) bucket of `chromium-browser-snapshots`, and `npx @puppeteer/browsers install chromium@<revision> --platform mac_arm`. Chromium 85 has no arm64 build and runs under Rosetta. Chromium 120 and 114 did not run on macOS 27 (crash at startup, or hang).
3. Drive each with `puppeteer-core` (version 19 for Chromium 108, which 21 cannot open a page in): load `/`, `/app/sign-in`, `/app/onboarding`, `/privacy` at 1920x1080 and 2560x1440, take screenshots, and read console errors, failed requests, `CSS.supports` and the `CSSLayerBlockRule` check. Data calls to the API fail without a Worker; they are not rendering problems.
4. To find what breaks, import every file in `dist/assets` in the engine (`await import('/assets/<file>')`) and list the ones that throw.

**Lowering the floor to Chromium 94** (Samsung 2023, webOS 23) would take, measured on a Chromium 94 build:

- `vite build --target chrome94` (JS +0.4%) lowers the syntax. Chromium 85 needs `chrome85` (JS +1.7%, CSS +14.6%).
- Flatten `@layer` with `@csstools/postcss-cascade-layers` (CSS grows about 25%). Lightning CSS cannot lower layers. With this, 94 renders the landing page like current Chrome.
- A `vh` fallback before every `dvh` (12 uses) and `lvh`, which 94 lacks and which loses the vertical centring of the onboarding and sign-in screens.
- Fallbacks for `translate:`, `:has()` and range media queries Lightning CSS does not lower, or a `@supports` guard on each.
- Polyfills for `structuredClone`, `findLastIndex`, `AbortSignal.timeout`; and a test run on a real Chromium 94 TV, since none of this was run on a TV.

Chromium 85 and 87 additionally lose the padding of every Tailwind `px-` and `py-` class after flattening, which was not diagnosed, so they are not worth lowering to.

## graspy-teacher (apps/teacher)

Needs macOS on Apple Silicon, [Rust](https://rustup.rs), the Xcode Command Line Tools, CMake and Python 3, as well as the root `npm install`.

```bash
cd apps/teacher
npm run sidecars      # once: builds the model engine into src-tauri/binaries/
npm run tauri dev     # the app, with the Vite server on port 1420
```

- **Sidecars.** `scripts/fetch-sidecars.sh` downloads the llama.cpp `b9960` source release, checks its SHA-256, builds a static `llama-server` with Metal, and compiles the supervisor from `src-tauri/sidecars/inference-runner.rs`. It writes both to `src-tauri/binaries/`, which git ignores. The Rust build fails until they exist. The build takes a few minutes; the source is cached in `~/.cache/graspy-teacher-sidecars`. It skips the engine when the right build is already there, and `--force` rebuilds it.
- **The model.** On first launch the app asks for Gemma 4 E2B (2.8 GB): download it, or choose the same file from a drive. A second file (0.6 GB) lets it read photographs of lesson plans. Both are kept in the app data directory.
- **Test.** `npm test` and `npm run lint` run Vitest, the content-script tests, oxlint and the type check; the root `npm test` and `npm run lint` include them. Run the Rust suite as well: `npm run test:rust` and `npm run lint:rust` (clippy, warnings are errors), or `npm run check` for everything.
- **Tests that need a model** are `#[ignore]`d. Start `llama-server` with the model, set `GRASPY_LLAMA_BASE_URL`, and run `cargo test --manifest-path src-tauri/Cargo.toml -- --ignored`. [The qualification](../apps/teacher/docs/content/ordering-fractions-gemma-qualification.md) is one of them.
- **Command contracts.** The Rust suite rewrites `contracts/command-answers.json` from the command types. Commit it with the change that moved it; the frontend's `src/contracts` test reads it.
- **Build.** `npm run tauri build` writes `src-tauri/target/release/bundle/macos/graspy.app` and a `.dmg`. `scripts/launch-smoke.sh` then opens the app twice, as a teacher would, and checks that one instance runs and nothing crashed.
- **Content packages** in `src-tauri/resources/content` are built by `scripts/export_curriculum_packages.py`, `export_pacing_packages.py` and `export_textbook_corpus.py` from the plan-to-tutor dataset. Pass its paths as arguments, or set `PLAN_TO_TUTOR_ROOT` to its checkout. `scripts/extract_nerdc_revision.py` reads the NERDC PDF: `uv run scripts/extract_nerdc_revision.py --pdf … --dataset-root … --output …`.

## The logo

`apps/web/public/brand/graspy-lockup-v1.svg` is the web's logo: the sprout and the word "graspy" in one SVG, so they line up by construction and stay sharp at any size. The viewBox (`0 -563 4552 836`) is cropped to the ink: the sprout is as tall as the word, from the x-height top to the bottom of the descenders, and its left edge is the file's left edge. `Logo` (`apps/web/src/components/brand/logo.tsx`) reserves the same ratio with `width` and `height`. The service worker caches `/brand` by path, so a changed lockup gets a new file name (`-v2`) and `Logo` points at it. `sprout.svg` stays for the favicon and the sprout alone.

The word is Poppins SemiBold (SIL Open Font License, so it may be embedded and modified), drawn as outlines from `@fontsource/poppins` weight 600, not live text. To regenerate it:

1. Shape "graspy" with HarfBuzz (kerning on, no letter-spacing) from the 600 `.woff2` after decoding it to `.ttf` with fontTools, and write each glyph as an SVG path with fontTools' `SVGPathPen`, y flipped, baseline at 0.
2. Take the ink box of the word: x-height top to descender bottom is the lockup's height (-563 to 273 in font units).
3. Put the sprout path from `sprout.svg` (viewBox 24) in the same file, scaled so its stem bottom (y 23) lands on the descender line and its left leaf edge (x 3.4) on x 0, about 44.95 units per sprout unit; put the word to its right with the gap shown in the file, and set the viewBox to the combined ink.

The shipped file also has `role="img"` and `aria-label="graspy"`.

## Screen sizes and TVs

Onboarding has a split layout (two halves the height of the screen, the form scrolling inside its half) and a single column that scrolls as a page. The split needs a screen at least 64rem wide and 40rem tall (`split:` in `apps/web/src/index.css`); a shorter window, such as a laptop at 150% zoom or a tablet with its keyboard open, keeps the single column.

A width cannot tell a TV from a monitor, so `src/lib/device.ts` sets `<html data-device="tv">` from the user agent (Tizen, Web0S, SmartTV, GoogleTV, AFT*, BRAVIA and others). Add `?tv=1` to the URL to force it on while testing on a desktop (kept until `?tv=0`).

- A monitor or laptop scales the onboarding form and headline with the `.zoom` scope: 1 below 96rem, 1.1 from 96rem (and 46rem tall), 1.25 from 120rem (56rem tall), 1.5 from 160rem (76rem tall), and no more.
- A TV scales the whole app by the root font size, so every rem in the theme grows (type, spacing, widths, hit targets, and nothing is under 16px): 150% from 1280px wide, 175% from 1920px, 250% from 3200px. The `.zoom` scope is 1 on a TV so the two do not stack.

## Remote control and keyboard

`src/lib/remote-keys.ts` maps keys: the five-way pad and OK, Back (Escape on a TV, where Google TV and Fire TV remotes send it, GoBack, LG webOS 461, Samsung Tizen 10009, and Backspace on a TV outside a text field and a control; a held key or a chord only skips the action; Back keys are always swallowed so the platform never leaves the app; a link to a place on the same page moves there without a history entry), and ignores media keys (412, 413, 415, 19, 417) and colour keys (403 to 406). `src/lib/remote-input.ts` puts `data-input="remote"` on `<html>` when a key that moves focus is pressed (a TV browser may not apply `:focus-visible`) and takes it off for a pointer; the focus ring (a 3px outline in the page's ink with a gap in its own colour) shows on `:focus-visible` and on `:focus` in that mode. Back closes the topmost open popup first (a dialog, an open list or the voice note registers with `useBackHandler`), then steps back in the app's own history (the router's `history.state.idx`, so a page from before the app does not count); in a text field it only leaves the field; on the first screen it does nothing, so a stray key never leaves the app. Each new screen starts with focus on its title (`RouteFocus`).

### Testing on a TV

Open the staging URL of the web app in the TV's browser (Samsung Internet or the Tizen browser, the LG webOS browser, Silk on Fire TV, Chrome or the Google TV browser) or cast a tab with `?tv=1` from a desktop. Try, on each:

1. The first screen shows a focus ring on one control. The arrows move it to every control, in reading order, and nothing is out of reach (the logo, the skip link, each field, Back, Next).
2. OK on a field opens its list; Up and Down move in it; OK picks; Back closes the list and leaves the focus on the field. In a text field, Back only leaves the field (the on-screen keyboard goes away); it does not change screen.
3. On "Your subjects", Up and Down move between rows, OK toggles one, and the list scrolls so the focused row is never under the action bar.
4. Back on a screen the app opened from another screen of its own goes to that screen; Back on the first screen does nothing; Back never skips a popup.
5. The text is readable from the sofa (nothing small), buttons are easy to hit with a pointer remote (LG Magic Remote, Samsung pointer mode), and nothing needs hover or dragging.
6. In the chat box, the on-screen keyboard has a Send key and the page does not jump when it opens.
7. A lesson that needs the microphone says plainly that this screen has none, where the browser has no `getUserMedia`.

## Haptics

`haptics.trigger("press" | "correct" | "wrong" | "lessonComplete")` and `haptics.stop()` (`src/features/haptics/`). Patterns, the rate cap and the limits are in `haptic-patterns.ts`; the phone's motor in `haptic-device.ts`; a controller's rumble in `haptic-gamepad.ts`; the rules (setting on, page visible, no reduced motion, the learner has acted, one cue per 100 ms) in `create-haptics.ts`, which reads nothing itself; `haptics.ts` wires it to the browser. The learner's switch is "Vibration" on the You page (on by default, kept in `localStorage` under `graspy.haptics`, shown only where a phone or controller could feel it). Visual feedback is always the real feedback; haptics only add to it, and a missing API is a no-op. Cues come from a graded answer in a lesson's check (`answer_check`) and in a chat card (`answer_practice`, felt once per tap, not again when the card sends its answers with the message), a spoken answer marked right or "try again" (not "not understood"), a finished lesson, and the Record button of a voice lesson (`press`, 12 ms; no other button buzzes). Nothing listens to focus or to the remote's keys.

| Where | Vibration API | Controller rumble |
| --- | --- | --- |
| Chrome, Edge, Samsung Internet on Android | yes (needs a prior tap or key) | n/a |
| Firefox (Android) | no (removed in 129) | no |
| Safari and every browser on iOS | no | Safari 16.4 and later, with a controller |
| Desktop and TV browsers | no motor | Chromium and Safari with a controller; Firefox no |
| TV remote | no | no |

No intensity control exists on the Vibration API, so "wrong" is two 18 ms ticks (never longer than one right-answer pulse) and every cue totals at most 250 ms. Sources checked: MDN `Navigator.vibrate` (sticky user activation, boolean only reports valid parameters, a new call replaces the running pattern, 0 or `[]` cancels) and `GamepadHapticActuator.playEffect` (`dual-rumble`, magnitudes 0 to 1, a new effect pre-empts, rejects in a hidden document), caniuse "Vibration" and MDN browser-compat-data.

Not verified on a real device: the feel and strength of 12, 35 and 18/70/18 ms on any phone (motors differ; very short pulses may not be felt), whether a tap inside the lesson's sandboxed frame counts as activation for the page's `vibrate` call, any controller or TV runtime, Samsung Internet and Silent or Do Not Disturb behaviour. The iOS `<input type="checkbox" switch>` trick is not used: its mechanism is documented (a programmatic click on the switch's label), a WebKit report asks for user activation, but a break in iOS 26 was not confirmed.

## Names compared alike on the server and the web

`normalise` (apps/server/src/app/agent/subject_match.py) and `nameKey`
(apps/web/src/features/learn/lib/name-key.ts) must give the same key. Both fold Latin letters by the
table in `latin-ranges.json`, which the server holds as `latin_ranges.py`, and
`name-key-corpus.json` pins their results; no test reads the engine's own Unicode tables for
the script. To move to a newer Unicode, run `node scripts/generate-latin-ranges.mjs`, then
regenerate the keys of the corpus with the server's `normalise` and run both test suites.

## Add a tutor tool

1. Write the function. The model reads its name and docstring. It returns a `dict`, or an `Outcome` when the app must act on it or show a card.
2. Add it to `TOOLS` in `apps/server/src/app/agent/toolkit.py`.
3. A new action or card is a model in `agent/reply.py`. Add an example to `scripts/export_reply_contract.py`, then run that script. The web app's and views' tests fail until they handle the new action or card.
4. Give it a `chat.activity.<name>` line in every web locale and in `LearnCopy.kt`; the reply contract's test fails without it.

## Add a tutor skill

A skill is a teaching method the tutor loads with the `load_skill` tool when a message calls for it, so the guidance is not in every prompt.

1. Make `apps/server/src/app/agent/skills/<name>/SKILL.md`: frontmatter with `name` (the folder's name) and a one-line `description`, then a Markdown body of at most 250 words.
2. Nothing else. The tutor's catalogue is built from the folders, and `wrangler.jsonc` uploads every `SKILL.md` under `app/agent/skills/`. `tests/test_skills.py` fails on a folder without a SKILL.md, a name that differs from its folder, a missing description, or a body over the cap.
3. The description decides when the tutor loads it. Measure a change with `scripts/measure_skill_loading.py`.
4. A skill loaded in a turn stays in effect, on the same topic, until six turns after it was last loaded, at most two at once: each exchange keeps the skills in effect and their ages, and the server puts the file's current text into the tutor's input (`app/agent/skills/active.py`). Write the body for that: it is in front of the tutor on later turns, so it never tells the tutor to load it again.
5. A body can be split by turn of use with `## Turn 1`, `## Turn 2`, `## Turn 3 or later` headings (counting up from 1, as the tests check). Text before the first heading is always shown; after it only the step for the current turn, which the input heads with "turn N of using it". Use it when the tutor must not run ahead or stop short of a step, as `explaining-a-mistake` does: given all three steps, it still asked another question on turn 3 in 7 of 20 draws, and given only its own step it showed the full working in 19 of 20.
