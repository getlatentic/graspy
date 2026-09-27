#!/usr/bin/env bash
# Deploys graspy to one environment and stops at the first failure: the tutor Worker, the API
# Worker with its admin UI, the API's D1 migrations, then the web app. docs/DEPLOYING.md explains
# the order and the one-time setup.
#
#   scripts/deploy.sh staging
#   scripts/deploy.sh production                        asks for "production" to be typed
#   scripts/deploy.sh production --confirm production   for a run with no terminal
set -euo pipefail

cd "$(dirname "$0")/.."

PRODUCTION_API_ORIGIN="https://graspy-api.getlatentic.com"
FIREBASE_KEYS=(VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID)

die() {
  echo "deploy: $*" >&2
  exit 1
}

usage() {
  echo "Usage: scripts/deploy.sh staging|production [--confirm production]" >&2
  exit 2
}

step() {
  echo
  echo "==> $*"
}

environment="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
confirmed=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) confirmed="${2:-}"; shift 2 || usage ;;
    *) usage ;;
  esac
done

# wrangler's --env= (empty) is the top level, which is production.
case "$environment" in
  staging) wrangler_env="--env=staging"; database="graspy-staging"; web_build="build:staging" ;;
  production) wrangler_env="--env="; database="graspy"; web_build="build" ;;
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

# The API origin a web build calls, from the committed apps/web/.env.<environment>.
api_origin() {
  local url
  url="$(grep -E '^VITE_API_URL=' "apps/web/.env.$environment" | cut -d= -f2-)"
  [[ "$url" =~ ^(https://[^/]+) ]] || die "apps/web/.env.$environment has no https VITE_API_URL."
  echo "${BASH_REMATCH[1]}"
}

# public/_headers allows production's API in connect-src and frame-src; another environment's
# build allows that environment's API in its place.
point_csp_at_api() {
  local headers="apps/web/dist/_headers" origin
  origin="$(api_origin)"
  grep -q "$PRODUCTION_API_ORIGIN" "$headers" ||
    die "$headers no longer names $PRODUCTION_API_ORIGIN; update point_csp_at_api."
  sed "s#$PRODUCTION_API_ORIGIN#$origin#g" "$headers" > "$headers.next"
  mv "$headers.next" "$headers"
  if ! grep -q "connect-src[^;]*$origin" "$headers" || ! grep -q "frame-src[^;]*$origin" "$headers"; then
    die "$headers does not allow $origin."
  fi
}

deploy_web() {
  npm --prefix apps/web run "$web_build"
  point_csp_at_api
  if [[ "$environment" == "production" ]]; then
    (cd apps/web && npx wrangler pages deploy dist --project-name graspy --branch main)
  else
    (cd apps/web && npx wrangler deploy --config wrangler.staging.jsonc)
  fi
}

step "Checking $(git rev-parse --short HEAD) for $environment"
require_clean_tree
require_firebase_config
if [[ "$environment" == "production" ]]; then
  require_origin_main
  require_confirmation
fi

step "Tutor Worker"
(cd apps/tutor && npx wrangler deploy "$wrangler_env")

step "API Worker"
(cd apps/server && npm --prefix ui run build && uv run pywrangler deploy "$wrangler_env")

step "D1 migrations on $database"
(cd apps/server && npx wrangler d1 migrations apply "$database" "$wrangler_env" --remote)

step "Web app"
deploy_web

step "Deployed $(git rev-parse --short HEAD) to $environment"
