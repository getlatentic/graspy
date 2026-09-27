#!/usr/bin/env bash
# Decides whether the Deploy workflow may deploy one environment, and writes ready=true or
# ready=false to $GITHUB_OUTPUT. It fails the job, and so deploys nothing, when:
#
# - production is asked for from a ref other than main;
# - a repository or organization secret has a deploy secret's name. The deploy job would read it
#   whenever its environment lacks that secret, and any branch's workflow can read it;
# - the GitHub API does not answer as expected. Only a 404 for staging's environment means that
#   staging is not set up yet, and skips the deploy;
# - production has no environment, no required reviewer, or a branch rule other than main.
#
# The workflow passes, for each deploy secret, REPOSITORY_SECRET_<name> as true or false: whether
# a job with no environment sees a secret of that name. docs/DEPLOYING.md.
#
#   scripts/check-deploy-environment.sh staging|production <ref>
set -euo pipefail

DEPLOY_SECRETS=(CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID)

fail() {
  echo "::error::$*"
  exit 1
}

ready() {
  echo "ready=$1" >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT is not set}"
}

require_main_for_production() {
  [[ "$environment" != production || "$ref" == refs/heads/main ]] ||
    fail "Production is deployed from main only, not $ref."
}

require_no_repository_secrets() {
  local name flag shadowing=()
  for name in "${DEPLOY_SECRETS[@]}"; do
    flag="REPOSITORY_SECRET_$name"
    case "${!flag:-}" in
      true) shadowing+=("$name") ;;
      false) ;;
      *) fail "The workflow does not say whether a repository secret $name exists; pass $flag." ;;
    esac
  done
  [[ ${#shadowing[@]} -eq 0 ]] ||
    fail "Repository or organization secrets ${shadowing[*]} stand in for missing environment secrets. Delete them; deploy secrets belong to the staging and production environments only. docs/DEPLOYING.md."
}

# Sets status to the HTTP status of a GET, or to nothing when no answer came, and body to what
# was answered. gh's own error goes to the log.
api_get() {
  local response
  response="$(gh api --include "$1" | tr -d '\r')" || true
  status="$(head -n 1 <<< "$response" | awk '/^HTTP\// { print $2 }')"
  body="$(sed '1,/^$/d' <<< "$response")"
}

require_answer() {
  [[ "$status" == 200 ]] || fail "GitHub answered ${status:-nothing} for $1; not deploying. Run the workflow again, or check the job's actions: read permission."
}

# Sets branches to "any", "protected branches", or the branch rules, as "branch main, tag v*".
read_deployment_branches() {
  local policy
  policy="$(jq -c '.deployment_branch_policy' <<< "$body")"
  if [[ "$policy" == null ]]; then
    branches="any"
  elif [[ "$(jq '.custom_branch_policies' <<< "$policy")" != true ]]; then
    branches="protected branches"
  else
    api_get "$api/deployment-branch-policies?per_page=100"
    require_answer "the production branch rules"
    branches="$(jq -r '[.branch_policies[] | "\(.type) \(.name)"] | join(", ")' <<< "$body")"
  fi
}

require_production_protection() {
  local reviewers
  reviewers="$(jq '[.protection_rules[]? | select(.type == "required_reviewers") | .reviewers[]] | length' <<< "$body")"
  read_deployment_branches
  if [[ "$reviewers" -eq 0 || "$branches" != "branch main" ]]; then
    fail "Production needs a required reviewer and the branch main only; it has $reviewers reviewers and branches: $branches. docs/DEPLOYING.md."
  fi
}

environment="${1:-}"
ref="${2:-}"
[[ "$environment" == staging || "$environment" == production ]] ||
  fail "Usage: scripts/check-deploy-environment.sh staging|production <ref>"
api="repos/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}/environments/$environment"

require_main_for_production
require_no_repository_secrets

api_get "$api"
if [[ "$status" == 404 ]]; then
  [[ "$environment" != production ]] || fail "No production environment. Set it up as docs/DEPLOYING.md says."
  echo "::notice::Not deploying: no $environment environment."
  ready false
  exit 0
fi
require_answer "the $environment environment"

if [[ "$environment" == production ]]; then require_production_protection; fi
ready true
