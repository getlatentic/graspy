# Development

## Set up

Needs Node 22+ and [uv](https://docs.astral.sh/uv/). uv installs Python 3.14, the Workers runtime's version.

```bash
npm install
cp apps/server/.env.example apps/server/.env   # then set AWS_BEARER_TOKEN_BEDROCK
npm run dev
```

`npm install` also runs `uv sync` for the server. `npm run dev` starts the web app on port 5173 and the API on port 8081 under uvicorn, which reloads on each change. The web app calls port 8081, so leave `PORT` as it is.

Check it: <http://localhost:8081/api/health> answers, <http://localhost:8081/api/docs> lists the routes, and onboarding in the app makes a plan.

## Configure

The server's environment holds only what changes between deployments or is secret. Generation settings (temperature, token budgets) are in `apps/server/src/app/config/generation.py`, next to the prompts they tune.

| Variable | Purpose |
|---|---|
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock API key. The server does not start without it |
| `LLM_MODEL_ID` / `AWS_REGION` | The `bedrock-mantle` model and region. Defaults: `openai.gpt-oss-120b`, `us-east-1` |
| `SESSION_SECRET` | Signs session tokens. Required in production; in development a temporary key is made |
| `CORS_ORIGINS` | Allowed origins, comma-separated or JSON. One wildcard label is allowed; `*` is refused |
| `PUBLIC_BASE_URL` / `A2A_PATH_PREFIX` | The origin the agent card advertises, and the tutor's path (default `/a2a`) |
| `APP_ENV` | `production` hides `/api/docs` |
| `HOST` / `PORT` / `UVICORN_RELOAD` | uvicorn only, read by `uv run serve` |

The web app reads `VITE_API_URL` and `VITE_A2A_BASE` from the committed `apps/web/.env.<mode>` files. Vite writes them into the bundle at build time, and there are no defaults, so a build without them fails instead of pointing at the wrong host.

## Test

```bash
npm test && npm run lint                       # every package
cd apps/web && npm run test:e2e                # Cypress, with npm run dev running
cd apps/server && uv run pytest -m integration # real model calls, spends tokens
cd apps/server && uv run mutmut run            # finds tests that check nothing
```

- The server's unit tests never call a model. A stand-in model (`tests/stand_in.py`) answers through the real DSPy adapter, and each test reads back what every stage asked.
- The e2e specs stub nothing: a real browser, server and model. A full run takes about five minutes.
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

## Build and deploy

- **Web:** `npm run build` writes `apps/web/dist` for Cloudflare Pages, using `.env.production`.
- **Server:** needs the Workers Paid plan, because a lesson needs more than 10 ms of CPU. `npx wrangler login`, then `npx wrangler secret put` for `AWS_BEARER_TOKEN_BEDROCK` and `SESSION_SECRET`, then `npm run deploy` in `apps/server`. The plain values and bindings are in `apps/server/wrangler.jsonc`.
- **Imports that load at startup** grow the Worker's startup snapshot. It has a size cap, and past it a deploy fails with code 10013. Near the cap, the same build can pass or fail, so deploy a change that adds imports three times.
- `pylock.toml` pins what the Worker vendors. `pywrangler` rewrites it when `pyproject.toml` changes. Commit it.

## Add a tutor tool

1. Write the function. The model reads its name and docstring. It returns a `dict`, or an `Outcome` when the app must act on it or show a card.
2. Add it to `TOOLS` in `apps/server/src/app/agent/toolkit.py`.
3. A new action or card is a model in `agent/reply.py`. Add an example to `scripts/export_reply_contract.py`, then run that script. The web app's and views' tests fail until they handle the new action or card.
