# graspy web

The learner's app: a static Vite and React build for Cloudflare Pages.

| Command | Does |
|---|---|
| `npm run dev` | http://localhost:5173 |
| `npm run build` | Type-checks, then builds `dist/` |
| `npm test` / `npm run lint` | Vitest; oxlint |
| `npm run test:e2e` | Cypress, against the running server and a real model |

Start reading at `src/routes.tsx`. Each route's page is in `src/app/`, and what it renders is in `src/features/<feature>/`. Code shared by several features lives in `src/components/` and `src/lib/`. Pages under `/app` download when first opened, and a service worker (`public/sw.js`) keeps them for offline use.

The app keeps the plan, conversations and lesson copies in IndexedDB (`src/lib/idb.ts`). The learner's record is on the server. Signing in with Google is optional: an account holds learners, each with a plan their devices share (`src/lib/plan-sync.ts`), and signing out leaves nothing on the device (`src/lib/device-wipe.ts`). The interface is in English, Yoruba and Arabic (`src/locales/`).

Setup and testing are in [Development](../../docs/DEVELOPMENT.md).
