// Runs deploy.sh's deploy_api_worker with a stand-in uv that answers each upload as the test says.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = readFileSync(path.resolve(import.meta.dirname, "..", "deploy.sh"), "utf8");
const start = script.indexOf("deploy_api_worker() {");
const end = script.indexOf("\n}\n", start) + 3;
const FUNCTION = script.slice(start, end);

// Fails with `refuse` the first FAILS uploads, then passes; a file counts the uploads.
const STAND_IN_UV = `#!/usr/bin/env bash
count_file="$STAND_IN_DIR/count"
n=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$count_file"
if [[ "$n" -le "$FAILS" ]]; then echo "$REFUSAL"; exit 1; fi
echo "Current Version ID: stand-in"
`;

function deploy({ fails, refusal }) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-retry-"));
  const bin = path.join(dir, "uv");
  writeFileSync(bin, STAND_IN_UV);
  chmodSync(bin, 0o755);
  const run = spawnSync(
    "bash",
    ["-c", `set -euo pipefail; wrangler_env=""; mkdir -p apps/server; ${FUNCTION}\ndeploy_api_worker`],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STAND_IN_DIR: dir, FAILS: String(fails), REFUSAL: refusal },
    },
  );
  const uploads = Number(readFileSync(path.join(dir, "count"), "utf8"));
  return { status: run.status, uploads, output: `${run.stdout}${run.stderr}` };
}

const SNAPSHOT_REFUSAL = "An unknown error has occurred. [code: 10013]";

test("an upload refused with 10013 is asked again, and the deploy goes on when one passes", () => {
  const run = deploy({ fails: 2, refusal: SNAPSHOT_REFUSAL });
  assert.equal(run.status, 0);
  assert.equal(run.uploads, 3);
  assert.match(run.output, /attempt 2 of 4/);
});

test("an upload refused four times stops the deploy", () => {
  const run = deploy({ fails: 9, refusal: SNAPSHOT_REFUSAL });
  assert.notEqual(run.status, 0);
  assert.equal(run.uploads, 4);
});

test("any other failure stops at once", () => {
  const run = deploy({ fails: 9, refusal: "Upload too large [code: 10027]" });
  assert.notEqual(run.status, 0);
  assert.equal(run.uploads, 1);
});

test("an upload that passes is asked once", () => {
  const run = deploy({ fails: 0, refusal: SNAPSHOT_REFUSAL });
  assert.equal(run.status, 0);
  assert.equal(run.uploads, 1);
});
