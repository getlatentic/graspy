# Development

## Set up

Needs Node 22+ and [uv](https://docs.astral.sh/uv/). uv installs Python 3.14, the Workers runtime's version.

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

## Configure

The server's environment holds only what changes between deployments or is secret. Generation settings (temperature, token budgets) are in `apps/server/src/app/config/generation.py`, next to the prompts they tune.

| Variable | Purpose |
|---|---|
| `LLM_HOST` | Where gpt-oss-120b runs: `bedrock` (default) or `workers-ai` |
| `AWS_BEARER_TOKEN_BEDROCK` / `AWS_REGION` | Bedrock's API key and region (default `us-east-1`). Required for `bedrock` |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | The account and a token with Workers AI access. Required for `workers-ai` |
| `LLM_MODEL_ID` | Overrides the host's model id. Unset uses the host's gpt-oss-120b |
| `FIREBASE_API_KEY` | The Firebase project's web API key: the project whose sign-ins are accepted. A Worker secret in production. Unset turns sign-in off |
| `FIREBASE_AUTH_EMULATOR_HOST` | The Auth emulator's `host:port`, which then checks sign-ins in place of Google. Development only: the server refuses to start with it in production |
| `INTRON_API_KEY` | Intron's speech recognition, which hears the learner in voice lessons. Worker only: `.dev.vars` locally, a secret in production |
| `SPITCH_API_KEY` | Spitch's speech synthesis, the teacher's voice in voice lessons. Worker only: `.dev.vars` locally, a secret in production |
| `SESSION_SECRET` | Signs session tokens. Required in production; in development a temporary key is made |
| `CORS_ORIGINS` | Allowed origins, comma-separated or JSON. One wildcard label is allowed; `*` is refused |
| `PUBLIC_BASE_URL` / `A2A_PATH_PREFIX` | The origin the agent card advertises, and the tutor's path (default `/a2a`) |
| `APP_ENV` | `production` hides `/api/docs` |
| `HOST` / `PORT` / `UVICORN_RELOAD` | uvicorn only, read by `uv run serve` |

The web app reads `VITE_API_URL` and `VITE_A2A_BASE` from the committed `apps/web/.env.<mode>` files. Vite writes them into the bundle at build time, and there are no defaults, so a build without them fails instead of pointing at the wrong host.

In development, `apps/web/.env.development` points sign-in at the emulator (`VITE_FIREBASE_AUTH_EMULATOR`, which a production build ignores). A production build needs the Firebase web app's config in `apps/web/.env.production.local`, which git ignores: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`, from the Firebase console under Project settings, Your apps. Without them the app builds and sign-in is hidden.

## Test

```bash
npm test && npm run lint                                  # every npm package
cd apps/web && npm run test:e2e                           # Cypress, with npm run dev and the Auth emulator running
cd apps/mobile && ./gradlew testDebugUnitTest lintDebug   # Android, set up as apps/mobile/README.md says
cd apps/teacher && npm run test:rust && npm run lint:rust # the teacher app's Rust, and clippy
cd apps/server && uv run pytest -m integration            # real model calls, spends tokens
cd apps/server && uv run mutmut run                       # finds tests that check nothing
```

- Changes reach `main` through a pull request. CI (`.github/workflows/ci.yml`) runs the server, web, Android and teacher suites and the teacher's clippy, and a failing job blocks the merge.
- The server's unit tests never call a model. A stand-in model (`tests/stand_in.py`) answers through the real DSPy adapter, and each test reads back what every stage asked.
- The e2e specs stub nothing: a real browser, server and model, and Google's sign-in is the Auth emulator. A full run takes about five minutes.
- `tests/fixtures/slug-corpus.json` is read by both the server and the web app's tests. Both must spell a subject's slug the same way.
- `apps/web/src/lib/csp.test.ts` fails with the new hash when the inline script in `index.html` changes. Put that hash in `public/_headers`.
- A surviving mutant in `src/app/security/` or the calculator is a missing test.
- Check dependencies with `npm run audit` in `apps/web` and `uv run pip-audit` in `apps/server`.

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

## Build and deploy

- **Web:** `npm run build` writes `apps/web/dist` for Cloudflare Pages, using `.env.production`.
- **Server:** needs the Workers Paid plan, because a lesson needs more than 10 ms of CPU. `npx wrangler login`, then `npx wrangler secret put` for `SESSION_SECRET`, `FIREBASE_API_KEY`, `INTRON_API_KEY`, `SPITCH_API_KEY` and the host's credentials (`AWS_BEARER_TOKEN_BEDROCK`, or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`), then `npm run deploy` in `apps/server`. The plain values and bindings are in `apps/server/wrangler.jsonc`.
- **Imports that load at startup** grow the Worker's startup snapshot. It has a size cap, and past it a deploy fails with code 10013. Near the cap, the same build can pass or fail, so deploy a change that adds imports three times.
- `pylock.toml` pins what the Worker vendors. `pywrangler` rewrites it when `pyproject.toml` changes. Commit it.

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

## Add a tutor tool

1. Write the function. The model reads its name and docstring. It returns a `dict`, or an `Outcome` when the app must act on it or show a card.
2. Add it to `TOOLS` in `apps/server/src/app/agent/toolkit.py`.
3. A new action or card is a model in `agent/reply.py`. Add an example to `scripts/export_reply_contract.py`, then run that script. The web app's and views' tests fail until they handle the new action or card.
