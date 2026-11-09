#!/usr/bin/env bash
# Deletes an account for someone who cannot sign in and asked by email (docs/DEPLOYING.md): the
# learners and everything kept for them, then the Firebase user, through the same route the app
# uses. Run it only after the person has confirmed, from the address of the sign-in, that the
# account is theirs.
#
#   KEY_FILE=<key of graspy-account-delete> scripts/delete-account-by-request.sh <email> staging|production
set -euo pipefail

email="${1:?usage: delete-account-by-request.sh <email> staging|production}"
environment="${2:?usage: delete-account-by-request.sh <email> staging|production}"
key_file="${KEY_FILE:?KEY_FILE names a JSON key of graspy-account-delete}"
project=graspy-f482e
case "$environment" in
  staging) api="https://graspy-api-staging.getlatentic.com/api" ;;
  production) api="https://graspy-api.getlatentic.com/api" ;;
  *) echo "usage: delete-account-by-request.sh <email> staging|production" >&2; exit 2 ;;
esac
web_key="$(grep '^VITE_FIREBASE_API_KEY=' "apps/web/.env.$environment.local" | cut -d= -f2- | tr -d '\n')"
admin="$(gcloud auth print-access-token)"

uid="$(curl -fsS -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup" \
  -H "Authorization: Bearer $admin" -H "X-Goog-User-Project: $project" -H "Content-Type: application/json" \
  -d "{\"email\":[\"$email\"]}" | python3 -c 'import json,sys; users=json.load(sys.stdin).get("users") or []; print(users[0]["localId"] if users else "")')"
[[ -n "$uid" ]] || { echo "no Firebase user has the email $email" >&2; exit 1; }

read -r -p "Delete the $environment account of $email and everything kept for it? Type the email: " typed
[[ "$typed" == "$email" ]] || { echo "not confirmed; nothing was deleted" >&2; exit 1; }

# A custom token for that uid, signed with the service account's key, becomes the person's ID token.
custom="$(KEY_FILE="$key_file" UID_TO_SIGN="$uid" python3 - <<'PY'
import base64, json, os, subprocess, tempfile, time

key = json.load(open(os.environ["KEY_FILE"]))
encode = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
now = int(time.time())
claims = {
    "iss": key["client_email"], "sub": key["client_email"], "uid": os.environ["UID_TO_SIGN"],
    "aud": "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    "iat": now, "exp": now + 600,
}
unsigned = ".".join(encode(json.dumps(part).encode()) for part in ({"alg": "RS256", "typ": "JWT"}, claims))
with tempfile.NamedTemporaryFile("w", suffix=".pem") as pem:
    pem.write(key["private_key"]); pem.flush()
    signature = subprocess.run(["openssl", "dgst", "-sha256", "-sign", pem.name],
                               input=unsigned.encode(), capture_output=True, check=True).stdout
print(f"{unsigned}.{encode(signature)}")
PY
)"
id_token="$(curl -fsS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=$web_key" \
  -H "Content-Type: application/json" -d "{\"token\":\"$custom\",\"returnSecureToken\":true}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["idToken"])')"
session="$(curl -fsS -X POST "$api/session" -H "Content-Type: application/json" \
  -d "{\"firebaseIdToken\":\"$id_token\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"
status="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$api/account" -H "Authorization: Bearer $session")"
[[ "$status" == "204" ]] || { echo "the server answered $status; run it again" >&2; exit 1; }
echo "deleted: the learners, everything kept for them, and the Firebase user"
