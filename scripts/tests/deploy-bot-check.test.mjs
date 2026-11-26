// Runs deploy.sh's Turnstile checks as they are written: the site key a build may carry (a real key
// starts 0x4; Cloudflare's published test keys pass or fail everyone and production refuses them),
// and the check after the API Worker's upload: it waits for the answer of the version it uploaded (the
// old one answers until the new one arrives), then judges the bot check, and rolls back only a new
// version that answered badly. curl, sleep and wrangler are stood in for.
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

const NEW = "newsha";
const OLD = "oldsha";
const health = (build, challenge) => JSON.stringify({ status: "ok", details: { environment: "x", ...(challenge ? { challenge } : {}), ...(build ? { build } : {}) } });

// check_challenge against a health endpoint that answers `answers` in turn (the last one for ever):
// "none" for no answer, or a health body.
function checkRun(environment, answers) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-health-"));
  writeFileSync(path.join(dir, "asked"), "0");
  writeFileSync(path.join(dir, "answers"), answers.join("\n") + "\n");
  const program = `set -euo pipefail
${DIE}environment=${environment}
build_id=${NEW}
api_origin() { echo https://api.test; }
sleep() { :; }
curl() {
  local n total; n=$(cat asked); total=$(wc -l < answers); echo $((n + 1)) > asked
  (( n < total )) || n=$((total - 1))
  local line; line=$(sed -n "$((n + 1))p" answers)
  [[ "$line" != none ]] || return 22
  echo "$line"
}
${functionNamed("health_of")}
${functionNamed("wait_for_new_version")}
${functionNamed("check_challenge")}
status=0; check_challenge || status=$?
echo "verdict=$status"`;
  const run = spawnSync("bash", ["-c", program], { cwd: dir, encoding: "utf8" });
  const output = `${run.stdout}${run.stderr}`;
  return { output, verdict: Number(/verdict=(\d+)/.exec(output)?.[1]), asked: Number(readFileSync(path.join(dir, "asked"), "utf8")) };
}

test("a live new version passes in production and staging", () => {
  for (const environment of ["production", "staging"]) {
    const run = checkRun(environment, [health(NEW, "live")]);
    assert.equal(run.verdict, 0, run.output);
    assert.match(run.output, /is live/);
  }
});

test("the first deploy of the check: the old version answers with no challenge and no build, and the new one is not failed for it", () => {
  for (const environment of ["production", "staging"]) {
    const run = checkRun(environment, [health(), health(), "none", health(), health(NEW, "live")]);
    assert.equal(run.verdict, 0, run.output);
    assert.equal(run.asked, 5);
  }
});

test("an old version that says live does not pass for the new one, which is then judged on its own answer", () => {
  const run = checkRun("production", [health(OLD, "live"), health(OLD, "live"), health(NEW, "test-always-passes")]);
  assert.equal(run.verdict, 1, run.output);
  assert.match(run.output, /test secret/);
  assert.equal(run.asked, 3);
});

test("production with a new version on a test secret must go, whatever the test secret does", () => {
  for (const state of ["test-always-passes", "test-always-fails"]) {
    assert.equal(checkRun("production", [health(OLD, "live"), health(NEW, state)]).verdict, 1);
  }
});

test("staging with a new version on a test secret passes with a loud warning", () => {
  const run = checkRun("staging", [health(OLD, "live"), health(NEW, "test-always-passes")]);
  assert.equal(run.verdict, 0, run.output);
  assert.match(run.output, /NO protection/);
});

test("a new version whose bot check is off or unknown must go, in either environment", () => {
  for (const environment of ["production", "staging"]) {
    for (const state of ["off", "unknown"]) {
      const run = checkRun(environment, [health(NEW, state)]);
      assert.equal(run.verdict, 1, run.output);
      assert.match(run.output, /not live/);
    }
  }
});

test("a new version that is never seen, with the old one answering, is not rolled back", () => {
  for (const answers of [[health()], [health(OLD, "live")], [health(OLD, "live"), "none", health(OLD, "live")]]) {
    const run = checkRun("production", answers);
    assert.equal(run.verdict, 2, run.output);
    assert.equal(run.asked, 18);
    assert.match(run.output, /was not seen within 90 seconds/);
  }
});

test("nothing answering at the end, a Worker that refused to start, is rolled back", () => {
  const run = checkRun("production", [health(OLD, "live"), "none"]);
  assert.equal(run.verdict, 1, run.output);
  assert.equal(run.asked, 18);
  assert.match(run.output, /nothing answered/);
});

// roll_back_api_worker and settle_bot_check, with wrangler (npx) recording every argument it is given.
function rollbackRun({ environment, previous, verdict }) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-rollback-"));
  const wranglerEnv = environment === "production" ? "--env=" : "--env=staging";
  const program = `set -euo pipefail
${DIE}environment=${environment}
wrangler_env='${wranglerEnv}'
build_id=${NEW}
previous_version='${previous}'
mkdir -p apps/server
npx() { for argument in "$@"; do printf 'arg:%s\\n' "$argument"; done; }
check_challenge() { return ${verdict}; }
${functionNamed("roll_back_api_worker")}
${functionNamed("settle_bot_check")}
settle_bot_check`;
  const run = spawnSync("bash", ["-c", program], { cwd: dir, encoding: "utf8" });
  const output = `${run.stdout}${run.stderr}`;
  return { status: run.status, output, args: [...output.matchAll(/^arg:(.*)$/gm)].map((m) => m[1]).slice(1) };
}

for (const environment of ["production", "staging"]) {
  test(`${environment}: a failed bot check rolls back to the version serving before the upload, by its id`, () => {
    const run = rollbackRun({ environment, previous: "11111111-aaaa", verdict: 1 });
    assert.notEqual(run.status, 0);
    assert.deepEqual(run.args.slice(0, 3), ["rollback", "11111111-aaaa", environment === "production" ? "--env=" : "--env=staging"]);
    assert.ok(run.args.includes("--yes"));
    assert.match(run.output, /web app was not deployed/);
  });

  test(`${environment}: with no recorded version the rollback names none, and passes no empty argument`, () => {
    const run = rollbackRun({ environment, previous: "", verdict: 1 });
    assert.equal(run.args[0], "rollback");
    assert.ok(run.args.every((argument) => argument !== ""), JSON.stringify(run.args));
    assert.equal(run.args[1], environment === "production" ? "--env=" : "--env=staging");
  });
}

test("a new version that was never seen is not rolled back, and the deploy stops before the web app", () => {
  const run = rollbackRun({ environment: "production", previous: "v1", verdict: 2 });
  assert.notEqual(run.status, 0);
  assert.deepEqual(run.args, []);
  assert.match(run.output, /nothing was rolled back/);
});

test("a passing bot check goes on to the web app, with no rollback", () => {
  const run = rollbackRun({ environment: "production", previous: "v1", verdict: 0 });
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.args, []);
});

test("the version serving is recorded before the upload, the upload carries the commit, and the check comes before the web app", () => {
  const record = script.indexOf('previous_version="$(serving_version)"');
  const upload = script.indexOf("\ndeploy_api_worker\n", record);
  const check = script.indexOf("\nsettle_bot_check\n", upload);
  const web = script.indexOf('step "Web app"\ndeploy_web');
  assert.ok(record > 0 && record < upload && upload < check && check < web);
  assert.match(functionNamed("deploy_api_worker"), /pywrangler deploy "\$wrangler_env" --var "BUILD_ID:\$build_id"/);
});
