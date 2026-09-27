# Deploying

## Environments

Staging is a full copy of production with its own Workers, database, bucket and secrets. Try a change there first.

| | Production | Staging |
|---|---|---|
| Web | <https://graspy.getlatentic.com>, Pages project `graspy` | <https://graspy-staging.getlatentic.com>, Worker `graspy-staging` (`apps/web/wrangler.staging.jsonc`) |
| API | <https://graspy-api.getlatentic.com>, Worker `graspy-web-api` | <https://graspy-api-staging.getlatentic.com>, Worker `graspy-web-api-staging` |
| Tutor | Worker `graspy-tutor` | Worker `graspy-tutor-staging` |
| D1 / R2 | `graspy` / `graspy-audio` | `graspy-staging` / `graspy-audio-staging` |
| Android | `com.latentic.graspy` (Play) | `com.latentic.graspy.staging`, "graspy staging" |
| Config | top level of each `wrangler.jsonc`, `apps/web/.env.production` | `env.staging` of each `wrangler.jsonc`, `apps/web/.env.staging` |

Both sign in with the Firebase project `graspy-f482e`. `APP_ENV=staging` behaves as production: no `/api/docs`, `SESSION_SECRET` required, no Auth emulator.

## Deploy

- **Staging** is deployed after each push to `main` that passes CI (`.github/workflows/deploy.yml`). By hand: `scripts/deploy.sh staging`.
- **Production** is deployed by hand only, from an up-to-date `main`: `scripts/deploy.sh production`, then type `production`. Or run the Deploy workflow with environment `production` and confirm `production`.
- **Android staging:** `cd apps/mobile && ./gradlew installStaging`. It installs beside the Play app, signed with the debug key.

`scripts/deploy.sh` first checks that the tree is clean and that the web build has its Firebase config (in the environment or `apps/web/.env.<environment>.local`). For production it also checks that `HEAD` is `origin/main`, and asks for confirmation. Then it deploys in this order and stops at the first failure:

1. **The tutor.** The API's `TUTOR` binding needs its Worker to exist, and the API calls it, so the tutor goes first. It must keep answering what the running API asks.
2. **The API**, with the admin UI built first.
3. **The API's D1 migrations**, `wrangler d1 migrations apply <database> --remote`.
4. **The web app**, built in that environment's mode. `public/_headers` allows production's API in `connect-src` and `frame-src`; the script puts the environment's API in its place.

A deploy that fails with code 10013 is the startup snapshot's size cap ([Development](DEVELOPMENT.md#build-and-deploy)). Run the script again: it stopped before the migrations.

### Migrations

Migrations are applied after the API's new code is live. So:

- A migration must work with the code before it and the code after it. The new code runs for a moment on the old schema, and a rollback (`wrangler rollback`) runs the old code on the new one.
- Code that needs a new table or column ships one deploy after the migration that adds it.
- A migration that must follow its code says so in its header, as `0015_turn_attempts_restart.sql` does.

## One-time setup

Done: D1 `graspy-staging`, R2 `graspy-audio-staging`, the Worker `graspy-staging` for the web, the Firebase authorized domain `graspy-staging.getlatentic.com`, and the Firebase Android app for `com.latentic.graspy.staging` with the debug key's fingerprints.

The rest, in order, from the repository root, logged in with `npx wrangler login`:

1. **Staging secrets.** The first `secret put` makes a draft `graspy-web-api-staging`. Values go through pipes and prompts only, never to the screen:

   ```bash
   cd apps/server
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET --env staging
   grep '^AWS_BEARER_TOKEN_BEDROCK=' .env | cut -d= -f2- | tr -d '\n' | npx wrangler secret put AWS_BEARER_TOKEN_BEDROCK --env staging
   grep '^VITE_FIREBASE_API_KEY=' ../web/.env.staging.local | cut -d= -f2- | tr -d '\n' | npx wrangler secret put FIREBASE_API_KEY --env staging
   npx wrangler secret put INTRON_API_KEY --env staging   # paste at the hidden prompt
   npx wrangler secret put SPITCH_API_KEY --env staging   # paste at the hidden prompt
   npx wrangler secret list --env staging
   ```

2. **Custom domains.** The first deploy attaches `graspy-api-staging.getlatentic.com` and `graspy-staging.getlatentic.com`. Neither may have a DNS record of its own (code 100117). Check that nothing answers:

   ```bash
   dig +short graspy-api-staging.getlatentic.com graspy-staging.getlatentic.com
   ```

3. **First staging deploy**, from `main` once this is merged: `scripts/deploy.sh staging`. It creates both Workers and applies every migration to the empty `graspy-staging`.

4. **GitHub secrets**, for the Deploy workflow. It skips, and does not fail, until all six exist. Make the API token in the dashboard from the "Edit Cloudflare Workers" template, add Account D1 Edit and Cloudflare Pages Edit, and limit it to the Latentic account and the zone `getlatentic.com`:

   ```bash
   gh secret set CLOUDFLARE_ACCOUNT_ID --repo getlatentic/graspy --body f868290b46a61872545e64f71de18d51
   gh secret set CLOUDFLARE_API_TOKEN --repo getlatentic/graspy   # paste at the prompt
   for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID; do
     grep "^$key=" apps/web/.env.staging.local | cut -d= -f2- | tr -d '\n' | gh secret set "$key" --repo getlatentic/graspy
   done
   ```

A new machine that builds the staging app signs it with its own debug key. Google sign-in works only once that key's fingerprints are on the staging Android app:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep -E 'SHA1|SHA256'
npx firebase-tools@15.31.0 apps:android:sha:create 1:110976513007:android:4736d798e69313783abc1a <SHA> --project graspy-f482e
```
