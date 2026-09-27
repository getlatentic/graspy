#!/usr/bin/env bash
# Deploys graspy to one environment. It installs with the pinned npm and builds everything first,
# so a failed install or build deploys nothing. Then it deploys the tutor Worker, the API Worker
# with its admin UI, the API's D1 migrations and the web app, and stops at the first failure.
# docs/DEPLOYING.md explains the order and the one-time setup.
#
#   scripts/deploy.sh staging
#   scripts/deploy.sh production                        asks for "production" to be typed
#   scripts/deploy.sh production --confirm production   for a run with no terminal
#   scripts/deploy.sh staging|production --dry-run      every check, install and build; no deploy
set -euo pipefail

cd "$(dirname "$0")/.."

PRODUCTION_API_ORIGIN="https://graspy-api.getlatentic.com"
FIREBASE_KEYS=(VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID)
DEPLOYED_WORKSPACES=(apps/tutor apps/server/ui apps/web)

# The committed apps/web/.env.<environment> names the API a web build calls, not the shell.
unset VITE_API_URL VITE_A2A_BASE

die() {
  echo "deploy: $*" >&2
  exit 1
}

usage() {
  echo "Usage: scripts/deploy.sh staging|production [--confirm production] [--dry-run]" >&2
  exit 2
}

step() {
  echo
  echo "==> $*"
}

environment="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
confirmed=""
dry_run=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) confirmed="${2:-}"; shift 2 || usage ;;
    --dry-run) dry_run="yes"; shift ;;
    *) usage ;;
  esac
done

# wrangler's --env= (empty) is the top level, which is production.
case "$environment" in
  staging) wrangler_env="--env=staging"; database="graspy-staging"; web_build="build:staging"; other_environment="production" ;;
  production) wrangler_env="--env="; database="graspy"; web_build="build"; other_environment="staging" ;;
  *) usage ;;
esac

require_clean_tree() {
  [[ -z "$(git status --porcelain)" ]] || die "the working tree has changes; deploy a commit, not a working tree."
}

require_origin_main() {
  git fetch --quiet origin main
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] ||
    die "production deploys origin/main only; HEAD is $(git rev-parse --short HEAD)."
}

# Sign-in is hidden in a build without the Firebase web config, so a deploy without it is refused.
require_firebase_config() {
  local local_file="apps/web/.env.$environment.local" missing=() key
  for key in "${FIREBASE_KEYS[@]}"; do
    if [[ -z "${!key:-}" ]] && ! grep -Eq "^$key=.+" "$local_file" 2>/dev/null; then
      missing+=("$key")
    fi
  done
  [[ ${#missing[@]} -eq 0 ]] ||
    die "the web build needs ${missing[*]}, in the environment or in $local_file."
}

require_confirmation() {
  [[ "$confirmed" == "production" ]] && return
  [[ -t 0 ]] || die "production needs --confirm production when there is no terminal."
  local answer
  read -r -p "Deploy $(git rev-parse --short HEAD) to production? Type production: " answer
  [[ "$answer" == "production" ]] || die "not confirmed; nothing was deployed."
}

# The npm that wrote package-lock.json, from package.json's packageManager. Another npm can
# install less than the lockfile names and not fail.
pinned_npm() {
  local manager
  manager="$(node -p 'require("./package.json").packageManager ?? ""')"
  [[ "$manager" =~ ^npm@([0-9]+\.[0-9]+\.[0-9]+)$ ]] || die "package.json's packageManager is not npm@<version>."
  echo "npm@${BASH_REMATCH[1]}"
}

install_dependencies() {
  local npm
  npm="$(pinned_npm)"
  step "Installing with $npm"
  npx --yes "$npm" ci --ignore-scripts
  node scripts/require-installed.mjs "${DEPLOYED_WORKSPACES[@]}" ||
    die "$npm ci did not install every package the deployed workspaces declare."
  (cd apps/server && uv sync --locked)
}

# A value from the committed apps/web/.env.<environment>.
web_env() {
  local value
  value="$(grep -E "^$1=" "apps/web/.env.$2" | cut -d= -f2-)"
  [[ "$value" =~ ^https:// ]] || die "apps/web/.env.$2 has no https $1."
  echo "$value"
}

api_origin() {
  [[ "$(web_env VITE_API_URL "$1")" =~ ^(https://[^/]+) ]] || die "apps/web/.env.$1 has no https VITE_API_URL."
  echo "${BASH_REMATCH[1]}"
}

# The bundle calls this environment's API, and never the other environment's.
require_bundle_calls_own_api() {
  local key value other
  for key in VITE_API_URL VITE_A2A_BASE; do
    value="$(web_env "$key" "$environment")"
    grep -rqF --exclude=_headers "$value" apps/web/dist ||
      die "apps/web/dist does not call $value from apps/web/.env.$environment; is $key set in apps/web/.env.$environment.local?"
  done
  other="$(api_origin "$other_environment")"
  if grep -rqF --exclude=_headers "$other" apps/web/dist; then
    die "apps/web/dist calls $other, the $other_environment API."
  fi
}

# public/_headers allows production's API in connect-src and frame-src; another environment's
# build allows that environment's API in its place.
point_csp_at_api() {
  local headers="apps/web/dist/_headers" origin
  origin="$(api_origin "$environment")"
  grep -q "$PRODUCTION_API_ORIGIN" "$headers" ||
    die "$headers no longer names $PRODUCTION_API_ORIGIN; update point_csp_at_api."
  sed "s#$PRODUCTION_API_ORIGIN#$origin#g" "$headers" > "$headers.next"
  mv "$headers.next" "$headers"
}

require_csp_allows_own_api() {
  local headers="apps/web/dist/_headers" origin other
  origin="$(api_origin "$environment")"
  other="$(api_origin "$other_environment")"
  if ! grep -q "connect-src[^;]*$origin" "$headers" || ! grep -q "frame-src[^;]*$origin" "$headers"; then
    die "$headers does not allow $origin."
  fi
  if grep -qF "$other" "$headers"; then
    die "$headers allows $other, the $other_environment API."
  fi
}

build_web() {
  npm --prefix apps/web run "$web_build"
  require_bundle_calls_own_api
  if [[ "$environment" != "production" ]]; then point_csp_at_api; fi
  require_csp_allows_own_api
}

deploy_web() {
  if [[ "$environment" == "production" ]]; then
    (cd apps/web && npx wrangler pages deploy dist --project-name graspy --branch main)
  else
    (cd apps/web && npx wrangler deploy --config wrangler.staging.jsonc)
  fi
}

# What each deploy would upload, bundled and checked by wrangler without an account. Pages and
# the D1 migrations have no such check.
bundle_without_deploying() {
  step "Tutor Worker, bundled only"
  (cd apps/tutor && npx wrangler deploy "$wrangler_env" --dry-run)
  step "API Worker, bundled only"
  (cd apps/server && uv run pywrangler deploy "$wrangler_env" --dry-run)
  if [[ "$environment" != "production" ]]; then
    step "Web app, bundled only"
    (cd apps/web && npx wrangler deploy --config wrangler.staging.jsonc --dry-run)
  fi
  step "Dry run of $(git rev-parse --short HEAD) for $environment passed; nothing was deployed"
}

step "Checking $(git rev-parse --short HEAD) for $environment"
require_clean_tree
require_firebase_config
if [[ "$environment" == "production" ]]; then
  require_origin_main
  if [[ -z "$dry_run" ]]; then require_confirmation; fi
fi

install_dependencies

step "Building the admin UI"
npm --prefix apps/server/ui run build

step "Building the web app"
build_web

if [[ -n "$dry_run" ]]; then
  bundle_without_deploying
  exit 0
fi

step "Tutor Worker"
(cd apps/tutor && npx wrangler deploy "$wrangler_env")

step "API Worker"
(cd apps/server && uv run pywrangler deploy "$wrangler_env")

step "D1 migrations on $database"
(cd apps/server && npx wrangler d1 migrations apply "$database" "$wrangler_env" --remote)

step "Web app"
deploy_web

step "Deployed $(git rev-parse --short HEAD) to $environment"
