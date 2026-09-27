# graspy server

One FastAPI app, deployed as a Cloudflare Python Worker and run locally under uvicorn. It serves `/api` (REST and streams), `/a2a` (the tutor) and `/mcp` (the views in `ui/`).

| Command | Does |
|---|---|
| `npm run dev` | uvicorn on port 8081, reloading on each change |
| `npm run worker:dev` | The Worker in `workerd`, with its Durable Objects and rate limits |
| `npm test` / `npm run lint` | pytest; ruff |
| `npm run deploy` | Builds the views and deploys the production Worker alone. Deploy with `scripts/deploy.sh` ([Deploying](../../docs/DEPLOYING.md)) |

Start reading at `src/worker.py` (the Worker and its Durable Objects) or `src/app/main.py` (uvicorn). Both build the app with `src/app/factory.py`.

Setup, configuration and deployment are in [Development](../../docs/DEVELOPMENT.md). How it fits together is in [Architecture](../../docs/ARCHITECTURE.md).
