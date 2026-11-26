#!/usr/bin/env bash
# Checks on the real D1 what the anonymous chat's counts rely on (app/api/anonymous_chat.py): a
# conditional upsert under a limit of 2, run three times, returns the new count twice and then no
# row. Uses wrangler's own login, a scratch bucket that it deletes after, and no model.
#
#   scripts/probe_anonymous_counts.sh staging
#   scripts/probe_anonymous_counts.sh production
#
# Run from apps/server. Exits 0 and prints "ok" when D1 answers [1], [2], [] and reports
# meta.changes 1, 1, 0.
set -euo pipefail

env_name="${1:?usage: probe_anonymous_counts.sh staging|production}"
case "$env_name" in
  staging) env_flag=(--env staging); database=graspy-staging ;;
  production) env_flag=(); database=graspy ;;
  *) echo "unknown environment: $env_name" >&2; exit 2 ;;
esac

bucket="probe:$(date +%s)"
expires=$(( ($(date +%s) + 600) * 1000 ))
spend="INSERT INTO anonymous_chat_use (bucket, turns, expires_at) VALUES ('$bucket', 1, $expires) ON CONFLICT (bucket) DO UPDATE SET turns = turns + 1 WHERE turns < 2 RETURNING turns;"

cleanup() {
  npx wrangler d1 execute "$database" "${env_flag[@]}" --remote \
    --command "DELETE FROM anonymous_chat_use WHERE bucket = '$bucket';" >/dev/null
}
trap cleanup EXIT

answer=$(npx wrangler d1 execute "$database" "${env_flag[@]}" --remote --json \
  --command "$spend $spend $spend")

python3 - "$answer" <<'PY'
import json
import sys

text = sys.argv[1]
results = json.loads(text[text.index("[") :])
seen = [([row["turns"] for row in r["results"]], r["meta"]["changes"]) for r in results]
print(seen)
assert seen == [([1], 1), ([2], 1), ([], 0)], "D1 does not answer as the counts assume"
print("ok")
PY
