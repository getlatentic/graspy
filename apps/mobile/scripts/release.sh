#!/usr/bin/env bash
# Builds graspy's signed release bundle and APK.
# The keystore password goes from the macOS Keychain into Gradle's environment only: it is never
# echoed, written to a file, or put on a command line.
set -euo pipefail

cd "$(dirname "$0")/.."

store="${GRASPY_RELEASE_STORE_FILE:-$HOME/.config/graspy/signing/graspy-release.jks}"
key_alias="${GRASPY_RELEASE_KEY_ALIAS:-graspy}"
if [[ ! -f "$store" ]]; then
  echo "No release keystore at $store. Restore graspy-release from iCloud Drive." >&2
  exit 1
fi
if ! password="$(security find-generic-password -a graspy -s graspy-release-keystore -w)"; then
  echo "The keystore password is not in the Keychain (service graspy-release-keystore, account graspy)." >&2
  exit 1
fi

# No daemon, and Kotlin compiled in the build's own process, so nothing holding the password outlives it.
GRASPY_RELEASE_STORE_FILE="$store" \
  GRASPY_RELEASE_KEY_ALIAS="$key_alias" \
  GRASPY_RELEASE_STORE_PASSWORD="$password" \
  ./gradlew --no-daemon -Pkotlin.compiler.execution.strategy=in-process bundleRelease assembleRelease "$@"

echo "Bundle: $PWD/app/build/outputs/bundle/release/app-release.aab"
echo "APK:    $PWD/app/build/outputs/apk/release/app-release.apk"
