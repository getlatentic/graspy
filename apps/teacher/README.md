# graspy-teacher

The teacher's app: plan a term, write lessons, and make lesson materials offline, with a local model. Tauri 2 (Rust, SQLite) and React 19 on macOS.

| Command | Does |
|---|---|
| `npm run sidecars` | Builds `llama-server` and its supervisor into `src-tauri/binaries/` (once, before any Rust build) |
| `npm run tauri dev` / `npm run tauri build` | Runs the app; builds the `.app` and `.dmg` |
| `npm test` / `npm run lint` | Vitest and the content-script tests; oxlint and the type check |
| `npm run test:rust` / `npm run lint:rust` | `cargo test`; `cargo clippy` |

Start reading at `src/app/App.tsx` for the screens and `src-tauri/src/lib.rs` for the commands they call. Each feature has the same parts in both halves: `src/features/<feature>/` (domain, application, infrastructure, ui) and `src-tauri/src/<feature>/`. The database schema is `src-tauri/src/db/migrations/`. Design notes are in `docs/architecture/`.

Setup and testing are in [Development](../../docs/DEVELOPMENT.md). Content licences are in [THIRD_PARTY_CONTENT.md](THIRD_PARTY_CONTENT.md).
