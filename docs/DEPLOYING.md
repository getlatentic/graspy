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

- **Staging** is deployed after each push to `main` that passes CI (`.github/workflows/deploy.yml`). By hand, from any commit: `scripts/deploy.sh staging`.
- **Production** is deployed by hand only, from an up-to-date `main`: `scripts/deploy.sh production`, then type `production`. Or run the Deploy workflow from `main` with environment `production` and confirm `production`, and approve it as the reviewer.
- **Check without deploying:** `scripts/deploy.sh staging --dry-run` (or `production`). It runs every check, the install and the builds, and bundles the Workers without uploading them.
- **Android staging:** `cd apps/mobile && ./gradlew installStaging`. It installs beside the Play app, signed with the debug key.

`scripts/deploy.sh` is the only way to deploy; the apps have no `npm run deploy`. It deploys nothing until all of these pass:

1. The tree is clean, and the web build has its Firebase config (in the environment or `apps/web/.env.<environment>.local`). For production, `HEAD` is `origin/main`, and the deploy is confirmed.
2. `npm ci` with the npm that `package.json`'s `packageManager` names, run through `npx`. Another npm can skip a workspace's packages without an error. Then every package that the tutor, the admin UI and the web declare must be installed, and `uv sync --locked` for the API.
3. The admin UI and the web app are built. The web build must call the API in the committed `apps/web/.env.<environment>` and not the other environment's; a `VITE_API_URL` in the shell is ignored. `public/_headers` allows production's API in `connect-src` and `frame-src`; a staging build puts staging's API in its place.

Then it deploys in this order and stops at the first failure:

1. **The tutor.** The API's `TUTOR` binding needs its Worker to exist, and the API calls it, so the tutor goes first. It must keep answering what the running API asks.
2. **The API**, with the admin UI built in step 3.
3. **The API's D1 migrations**, `wrangler d1 migrations apply <database> --remote`.
4. **The web app.**

Code 10013 is the startup snapshot's size cap ([Development](DEVELOPMENT.md#build-and-deploy)): Cloudflare refuses the API Worker's upload, and the same build passes or fails at random. The script asks for the upload again, up to four times, for that error only; any other failure stops it. If all four are refused, run the script again: it stopped before the migrations.

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

   The tutor runs one small model call to write the digits, signs and units of a spoken line as words. Production and staging run it on Bedrock. It defaults to Workers AI, with nothing to set up, if `SPELLER_HOST` is unset. To run it on Bedrock (the AWS credits, and Gemma 4 E2B, the model that measured best: see `datasets/number-spelling/README.md`), put the Bedrock key on the tutor and set `SPELLER_HOST` to `bedrock` in `apps/tutor/wrangler.jsonc` (in `vars` for production and in `env.staging.vars` for staging, which does not inherit it), then deploy the tutor: `grep '^AWS_BEARER_TOKEN_BEDROCK=' ../server/.env | cut -d= -f2- | tr -d '\n' | npx wrangler secret put AWS_BEARER_TOKEN_BEDROCK --env staging`, run from `apps/tutor`. `SPELLER_MODEL` names another model on either host. Set `SPELLER_HOST` back to `workers-ai` to switch back.

2. **Custom domains.** The first deploy attaches `graspy-api-staging.getlatentic.com` and `graspy-staging.getlatentic.com`. Neither may have a DNS record of its own (code 100117). Check that nothing answers:

   ```bash
   dig +short graspy-api-staging.getlatentic.com graspy-staging.getlatentic.com
   ```

3. **First staging deploy**, from `main` once this is merged: `scripts/deploy.sh staging`. It creates both Workers and applies every migration to the empty `graspy-staging`.

4. **GitHub environments.** The Deploy workflow reads its secrets from the environments `staging` and `production`, never from the repository. Both deploy `main` only, and production waits for approval from `tosinamuda`. Until `staging` exists the workflow skips; it fails for production until production has its reviewer and branch rule. It also fails, for either, when GitHub's API gives any answer but the environment or a 404, and when a repository or organization secret has a deploy secret's name, since the deploy job would read it wherever the environment lacks that secret. `scripts/check-deploy-environment.sh` makes these checks. Make both, then check them:

   ```bash
   repo=getlatentic/graspy
   owner_id="$(gh api users/tosinamuda --jq .id)"
   gh api --method PUT "repos/$repo/environments/staging" --input - <<'JSON'
   {"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
   JSON
   gh api --method PUT "repos/$repo/environments/production" --input - <<JSON
   {"reviewers": [{"type": "User", "id": $owner_id}], "prevent_self_review": false,
    "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
   JSON
   gh api --method POST "repos/$repo/environments/staging/deployment-branch-policies" -f name=main -f type=branch
   gh api --method POST "repos/$repo/environments/production/deployment-branch-policies" -f name=main -f type=branch
   gh api "repos/$repo/environments" --jq '.environments[] | {name, rules: [.protection_rules[].type]}'
   gh api "repos/$repo/environments/production/deployment-branch-policies" --jq '.branch_policies[] | {name, type}'
   ```

   `prevent_self_review` is false because the owner both starts and approves a production deploy.

5. **Cloudflare API tokens**, one for each environment, so each can be revoked alone. Make them at **My Profile > API Tokens > Create Token > Create Custom Token**, with:

   | Resource | Permission |
   |---|---|
   | Account: Workers Scripts | Edit |
   | Account: D1 | Edit |
   | Account: Cloudflare Pages | Edit (production only; staging's web is a Worker) |
   | Zone: Workers Routes | Edit (the custom domains in each `wrangler.jsonc`) |

   Account Resources: Include, the Latentic account only. Zone Resources: Include, Specific zone, `getlatentic.com`; production's token also `tosinamuda.com`, since production's API keeps `graspy-api.tosinamuda.com` and wrangler re-sends every custom domain on each deploy. A Worker token cannot be limited to one environment's Workers, so either token can deploy either environment; the environment keeps the production token behind the reviewer.

6. **Environment secrets.** The token goes in at a hidden prompt; the Firebase web config comes from each environment's `.env.<environment>.local`. Nothing is printed:

   ```bash
   repo=getlatentic/graspy
   for env in staging production; do
     gh secret set CLOUDFLARE_ACCOUNT_ID --env "$env" --repo "$repo" --body f868290b46a61872545e64f71de18d51
     for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID; do
       grep "^$key=" "apps/web/.env.$env.local" | cut -d= -f2- | tr -d '\n' | gh secret set "$key" --env "$env" --repo "$repo"
     done
   done
   gh secret set CLOUDFLARE_API_TOKEN --env staging --repo "$repo"      # paste staging's token at the prompt
   gh secret set CLOUDFLARE_API_TOKEN --env production --repo "$repo"   # paste production's token at the prompt
   gh secret list --env staging --repo "$repo"
   gh secret list --env production --repo "$repo"
   gh secret list --repo "$repo"                                        # expect none: no repository secrets
   ```

A new machine that builds the staging app signs it with its own debug key. Google sign-in works only once that key's fingerprints are on the staging Android app:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep -E 'SHA1|SHA256'
npx firebase-tools@15.31.0 apps:android:sha:create 1:110976513007:android:4736d798e69313783abc1a <SHA> --project graspy-f482e
```
