// Runs deploy.sh's Turnstile checks as they are written: the site key a build may carry (a real key
// starts 0x4; Cloudflare's published test keys pass or fail everyone and production refuses them),
// and the health check after the API Worker's deploy (retried for a minute, refusing a test secret
// in production), with curl and sleep stood in for.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = readFileSync(path.resolve(import.meta.dirname, "..", "deploy.sh"), "utf8");

function functionNamed(name) {
  const start = script.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `deploy.sh has no ${name}`);
  return script.slice(start, script.indexOf("\n}\n", start) + 3);
}

const DIE = `die() { echo "deploy: $*" >&2; exit 1; }\n`;

function siteKeyRun(environment, key) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-site-key-"));
  const run = spawnSync(
    "bash",
    ["-c", `set -euo pipefail\n${DIE}environment=${environment}\n${functionNamed("require_turnstile_site_key")}\nrequire_turnstile_site_key`],
    { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, ...(key ? { VITE_TURNSTILE_SITE_KEY: key } : {}) } },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

const REAL_KEY = "0x4AAAAAAAExampleRealSiteKey1";
const TEST_KEYS = ["1x00000000000000000000AA", "2x00000000000000000000AB", "3x00000000000000000000FF"];

for (const environment of ["production", "staging"]) {
  test(`${environment} builds with a real site key, and says nothing of protection`, () => {
    const run = siteKeyRun(environment, REAL_KEY);
    assert.equal(run.status, 0, run.output);
    assert.doesNotMatch(run.output, /NO protection/);
  });
}

for (const key of TEST_KEYS) {
  test(`production refuses the test key ${key}`, () => {
    const run = siteKeyRun("production", key);
    assert.notEqual(run.status, 0);
    assert.match(run.output, /test keys/);
  });

  test(`staging builds with the test key ${key}, and says it has no protection`, () => {
    const run = siteKeyRun("staging", key);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /NO protection/);
  });
}

test("a build with no site key is refused", () => {
  for (const environment of ["production", "staging"]) {
    const run = siteKeyRun(environment, "");
    assert.notEqual(run.status, 0);
    assert.match(run.output, /needs VITE_TURNSTILE_SITE_KEY/);
  }
});

// check_challenge against a health endpoint that is silent `silent` times, then says `state`.
function healthRun(environment, state, silent = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-health-"));
  writeFileSync(path.join(dir, "asked"), "0");
  const program = `set -euo pipefail
${DIE}environment=${environment}
api_origin() { echo https://api.test; }
sleep() { :; }
curl() {
  local n; n=$(cat asked); echo $((n + 1)) > asked
  if (( n < ${silent} )); then return 22; fi
  echo '{"status":"ok","details":{"environment":"x","challenge":"${state}"}}'
}
${functionNamed("challenge_state")}
${functionNamed("wait_for_challenge_state")}
${functionNamed("check_challenge")}
check_challenge`;
  const run = spawnSync("bash", ["-c", program], { cwd: dir, encoding: "utf8" });
  return { status: run.status, output: `${run.stdout}${run.stderr}`, asked: Number(readFileSync(path.join(dir, "asked"), "utf8")) };
}

test("a live bot check passes in production and staging", () => {
  for (const environment of ["production", "staging"]) {
    const run = healthRun(environment, "live");
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /is live/);
  }
});

test("production with a test secret fails, whatever the test secret does", () => {
  for (const state of ["test-always-passes", "test-always-fails"]) {
    const run = healthRun("production", state);
    assert.notEqual(run.status, 0);
    assert.match(run.output, /test secret/);
  }
});

test("staging with a test secret passes with a loud warning", () => {
  const run = healthRun("staging", "test-always-passes");
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /NO protection/);
});

test("a bot check that is off or unknown fails, in either environment", () => {
  for (const environment of ["production", "staging"]) {
    for (const state of ["off", "unknown"]) {
      const run = healthRun(environment, state);
      assert.notEqual(run.status, 0);
      assert.match(run.output, /not live/);
    }
  }
});

test("a health check that is slow to answer is asked again, and passes", () => {
  const run = healthRun("production", "live", 5);
  assert.equal(run.status, 0, run.output);
  assert.equal(run.asked, 6);
});

test("a health check that never answers fails after a minute's tries", () => {
  const run = healthRun("production", "live", 1000);
  assert.notEqual(run.status, 0);
  assert.equal(run.asked, 12);
  assert.match(run.output, /did not answer/);
});

test("the API Worker is rolled back before the web app is deployed", () => {
  const api = script.indexOf('step "API Worker"');
  const check = script.indexOf("check_challenge || roll_back_api_worker");
  const web = script.indexOf('step "Web app"\ndeploy_web');
  assert.ok(api < check && check < web);
  assert.match(functionNamed("roll_back_api_worker"), /wrangler rollback "\$wrangler_env" --yes/);
});
