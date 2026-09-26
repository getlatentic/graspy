# graspy

An AI tutor that writes a curriculum for the learner's country and class, and teaches it in their language.

| Part | What it is |
|---|---|
| `apps/web` | The learner's app: React 19 and Vite, on Cloudflare Pages |
| `apps/mobile` | The learner's app for Android: Kotlin and Jetpack Compose, on the same API ([README](apps/mobile/README.md)) |
| `apps/server` | The API and the tutor: FastAPI and DSPy on a Cloudflare Python Worker, with gpt-oss-120b on Amazon Bedrock or Workers AI |
| `apps/server/ui` | The lesson, practice and reading views the server serves ([MCP Apps](https://github.com/modelcontextprotocol/ext-apps)) |
| `apps/teacher` | graspy-teacher, the teacher's app: lesson plans and materials made offline by a local Gemma 4 model, on Tauri 2 and React 19 for macOS |

1. Install Node 22+ and [uv](https://docs.astral.sh/uv/), then run `npm install`.
2. Run `cp apps/server/.env.example apps/server/.env`, then set `AWS_BEARER_TOKEN_BEDROCK` in it (or `LLM_HOST=workers-ai` with a Cloudflare account and token).
3. Run `npm run dev`. The app is at <http://localhost:5173>, the API at <http://localhost:8081>.
4. Run `npm test` and `npm run lint`.

Docs: [Development](docs/DEVELOPMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Security](docs/SECURITY.md)

Licence: [AGPL-3.0](LICENSE).
