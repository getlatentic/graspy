#!/usr/bin/env bash
# Put the two sidecars Tauri bundles into src-tauri/binaries/:
#   llama-server-<triple>             built from the pinned llama.cpp source release
#   graspy-inference-runner-<triple>  built from src-tauri/sidecars/inference-runner.rs
#
# The upstream prebuilt llama-server links a dozen @rpath dylibs, and Tauri's
# externalBin bundles a single file, so the sidecar is a static build of the
# pinned source instead. The source archive is verified by SHA-256 before use.
#
# Usage: scripts/fetch-sidecars.sh [--force]
set -euo pipefail

readonly LLAMA_TAG="b9960"
readonly LLAMA_BUILD_NUMBER="9960"
readonly LLAMA_COMMIT="a935fbffe1a3d31509c325c116454ab5d56b2eb8"
readonly LLAMA_SOURCE_URL="https://github.com/ggml-org/llama.cpp/archive/${LLAMA_COMMIT}.tar.gz"
readonly LLAMA_SOURCE_SHA256="ff924c53a7f2db568f1a2e576a9504bad91a31dc41afc68114a8664cb4b1a5d8"
readonly TARGET_TRIPLE="aarch64-apple-darwin"

readonly APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly OUTPUT_DIR="${APP_DIR}/src-tauri/binaries"
readonly WORK_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/graspy-teacher-sidecars"
readonly ARCHIVE="${WORK_DIR}/llama.cpp-${LLAMA_TAG}.tar.gz"
readonly SOURCE_DIR="${WORK_DIR}/llama.cpp-${LLAMA_COMMIT}"
readonly BUILD_DIR="${SOURCE_DIR}/build-graspy"
readonly SERVER_OUTPUT="${OUTPUT_DIR}/llama-server-${TARGET_TRIPLE}"
readonly RUNNER_SOURCE="${APP_DIR}/src-tauri/sidecars/inference-runner.rs"
readonly RUNNER_OUTPUT="${OUTPUT_DIR}/graspy-inference-runner-${TARGET_TRIPLE}"

fail() {
  echo "fetch-sidecars: $*" >&2
  exit 1
}

require_platform() {
  [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] ||
    fail "the sidecars target macOS arm64 (${TARGET_TRIPLE}); this machine is $(uname -s) $(uname -m)."
  local tool
  for tool in curl shasum tar cmake rustc otool; do
    command -v "${tool}" >/dev/null || fail "${tool} is required and not on PATH."
  done
}

server_is_current() {
  [[ -x "${SERVER_OUTPUT}" ]] || return 1
  local version
  version="$("${SERVER_OUTPUT}" --version 2>&1)" || return 1
  [[ "${version}" == *"version: ${LLAMA_BUILD_NUMBER} (${LLAMA_COMMIT})"* ]]
}

fetch_source() {
  mkdir -p "${WORK_DIR}"
  if [[ ! -f "${ARCHIVE}" ]] ||
    ! echo "${LLAMA_SOURCE_SHA256}  ${ARCHIVE}" | shasum -a 256 -c --status; then
    curl --fail --location --silent --show-error --output "${ARCHIVE}.partial" "${LLAMA_SOURCE_URL}"
    mv "${ARCHIVE}.partial" "${ARCHIVE}"
  fi
  echo "${LLAMA_SOURCE_SHA256}  ${ARCHIVE}" | shasum -a 256 -c --status ||
    fail "${LLAMA_SOURCE_URL} does not match SHA-256 ${LLAMA_SOURCE_SHA256}."
  rm -rf "${SOURCE_DIR}"
  tar -xzf "${ARCHIVE}" -C "${WORK_DIR}"
}

build_server() {
  cmake -S "${SOURCE_DIR}" -B "${BUILD_DIR}" --fresh \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DLLAMA_BUILD_NUMBER="${LLAMA_BUILD_NUMBER}" \
    -DLLAMA_BUILD_COMMIT="${LLAMA_COMMIT}" \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_METAL=ON \
    -DGGML_NATIVE=OFF \
    -DGGML_CPU_ARM_ARCH=armv8.2-a+dotprod+fp16 \
    -DGGML_OPENMP=OFF \
    -DLLAMA_CURL=OFF \
    -DLLAMA_OPENSSL=OFF \
    -DLLAMA_BUILD_TESTS=OFF \
    -DLLAMA_BUILD_EXAMPLES=OFF \
    -DLLAMA_BUILD_APP=OFF \
    -DLLAMA_BUILD_UI=OFF \
    -DLLAMA_BUILD_SERVER=ON
  cmake --build "${BUILD_DIR}" --config Release \
    --target llama-server --parallel "$(sysctl -n hw.logicalcpu)"
  mkdir -p "${OUTPUT_DIR}"
  install -m 755 "${BUILD_DIR}/bin/llama-server" "${SERVER_OUTPUT}"
  if otool -L "${SERVER_OUTPUT}" | grep -qE '/opt/homebrew|/usr/local|@rpath'; then
    fail "${SERVER_OUTPUT} links a library outside macOS and cannot be distributed."
  fi
  server_is_current || fail "${SERVER_OUTPUT} does not report build ${LLAMA_BUILD_NUMBER} (${LLAMA_COMMIT})."
}

build_runner() {
  mkdir -p "${OUTPUT_DIR}"
  rustc "${RUNNER_SOURCE}" \
    --edition 2021 \
    --target "${TARGET_TRIPLE}" \
    -C opt-level=3 \
    -C strip=symbols \
    -o "${RUNNER_OUTPUT}"
}

main() {
  local force=false
  [[ "${1:-}" == "--force" ]] && force=true
  require_platform
  if [[ "${force}" == true ]] || ! server_is_current; then
    fetch_source
    build_server
  else
    echo "fetch-sidecars: ${SERVER_OUTPUT} is already llama.cpp ${LLAMA_TAG}."
  fi
  build_runner
  "${SERVER_OUTPUT}" --version 2>&1 | grep "version:"
  file "${RUNNER_OUTPUT}"
}

main "$@"
