// Runs scripts/check-deploy-environment.sh with a stand-in gh that answers each API path from
// a table: an HTTP status and a body, or nothing at all, as when GitHub cannot be reached.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve(import.meta.dirname, "..", "check-deploy-environment.sh");
const REPOSITORY = "getlatentic/graspy";
const SECRETS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

// Prints what `gh api --include <path>` prints: the status line, headers, a blank line and the
// body. Like gh, it fails on any status but 2xx.
const STAND_IN_GH = `#!/usr/bin/env bash
[[ "$1 $2" == "api --include" ]] || { echo "stand-in gh: unexpected $*" >&2; exit 64; }
echo "$3" >> "$STAND_IN_CALLS"
answer="$STAND_IN_ANSWERS/$(printf '%s' "$3" | tr '/?=&' '____')"
[[ -f "$answer" ]] || { echo "error connecting to api.github.com" >&2; exit 1; }
status="$(head -n 1 "$answer")"
printf 'HTTP/2.0 %s\\r\\nContent-Type: application/json\\r\\n\\r\\n' "$status"
tail -n +2 "$answer"
[[ "$status" == 2* ]] || { echo "gh: (HTTP $status)" >&2; exit 1; }
`;

const environmentPath = (name) => `repos/${REPOSITORY}/environments/${name}`;
const branchRulesPath = `${environmentPath("production")}/deployment-branch-policies?per_page=100`;

const protectedProduction = {
  protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User" }] }],
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
};
const mainOnly = { branch_policies: [{ type: "branch", name: "main" }] };

function run({ environment, ref = "refs/heads/main", answers = {}, repositorySecrets = {} }) {
  const dir = mkdtempSync(path.join(tmpdir(), "check-deploy-environment-"));
  const bin = path.join(dir, "bin");
  const answerDir = path.join(dir, "answers");
  spawnSync("mkdir", ["-p", bin, answerDir]);
  writeFileSync(path.join(bin, "gh"), STAND_IN_GH);
  chmodSync(path.join(bin, "gh"), 0o755);
  for (const [apiPath, [status, body]] of Object.entries(answers)) {
    const file = apiPath.replace(/[/?=&]/g, "_");
    writeFileSync(path.join(answerDir, file), `${status}\n${JSON.stringify(body)}\n`);
  }
  const output = path.join(dir, "output");
  const calls = path.join(dir, "calls");
  writeFileSync(output, "");
  writeFileSync(calls, "");
  const secretFlags = Object.fromEntries(
    SECRETS.map((name) => [`REPOSITORY_SECRET_${name}`, String(repositorySecrets[name] ?? false)]),
  );
  for (const [name, value] of Object.entries(repositorySecrets)) {
    if (value === undefined) delete secretFlags[`REPOSITORY_SECRET_${name}`];
  }
  const result = spawnSync("bash", [script, environment, ref], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_OUTPUT: output,
      STAND_IN_ANSWERS: answerDir,
      STAND_IN_CALLS: calls,
      ...secretFlags,
    },
  });
  return {
    ...result,
    ready: readFileSync(output, "utf8"),
    calls: readFileSync(calls, "utf8").split("\n").filter(Boolean),
  };
}

function assertFails(result, message) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.equal(result.ready, "");
  assert.match(result.stdout, /::error::/);
  assert.match(result.stdout, message);
}

test("staging with its environment is ready", () => {
  const result = run({ environment: "staging", answers: { [environmentPath("staging")]: [200, {}] } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.ready, "ready=true\n");
});

test("staging is skipped, green, only when GitHub answers 404", () => {
  const result = run({
    environment: "staging",
    answers: { [environmentPath("staging")]: [404, { message: "Not Found" }] },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.ready, "ready=false\n");
  assert.match(result.stdout, /::notice::Not deploying: no staging environment/);
});

for (const status of [401, 403, 429, 500, 502]) {
  test(`staging fails when GitHub answers ${status}`, () => {
    const result = run({
      environment: "staging",
      answers: { [environmentPath("staging")]: [status, { message: "no" }] },
    });
    assertFails(result, new RegExp(`GitHub answered ${status} for the staging environment`));
  });
}

test("staging fails when GitHub cannot be reached", () => {
  const result = run({ environment: "staging" });
  assertFails(result, /GitHub answered nothing for the staging environment/);
});

for (const environment of ["staging", "production"]) {
  test(`${environment} fails, before asking GitHub, when a repository secret has a deploy secret's name`, () => {
    const result = run({
      environment,
      answers: { [environmentPath(environment)]: [200, protectedProduction], [branchRulesPath]: [200, mainOnly] },
      repositorySecrets: { CLOUDFLARE_API_TOKEN: true, VITE_FIREBASE_APP_ID: true },
    });
    assertFails(result, /secrets CLOUDFLARE_API_TOKEN VITE_FIREBASE_APP_ID stand in for missing environment secrets/);
    assert.deepEqual(result.calls, []);
  });
}

test("fails when the workflow does not say whether a repository secret exists", () => {
  const result = run({
    environment: "staging",
    answers: { [environmentPath("staging")]: [200, {}] },
    repositorySecrets: { VITE_FIREBASE_PROJECT_ID: undefined },
  });
  assertFails(result, /pass REPOSITORY_SECRET_VITE_FIREBASE_PROJECT_ID/);
});

test("production with a reviewer and the branch main only is ready", () => {
  const result = run({
    environment: "production",
    answers: { [environmentPath("production")]: [200, protectedProduction], [branchRulesPath]: [200, mainOnly] },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.ready, "ready=true\n");
});

test("production fails from a ref other than main", () => {
  const result = run({ environment: "production", ref: "refs/heads/claude/ci-deploy-workflow-tidy" });
  assertFails(result, /Production is deployed from main only, not refs\/heads\/claude\/ci-deploy-workflow-tidy/);
  assert.deepEqual(result.calls, []);
});

test("production fails with no environment", () => {
  const result = run({ environment: "production", answers: { [environmentPath("production")]: [404, {}] } });
  assertFails(result, /No production environment/);
});

test("production fails with no required reviewer", () => {
  const result = run({
    environment: "production",
    answers: {
      [environmentPath("production")]: [200, { ...protectedProduction, protection_rules: [] }],
      [branchRulesPath]: [200, mainOnly],
    },
  });
  assertFails(result, /it has 0 reviewers and branches: branch main/);
});

const branchCases = [
  ["any branch", null, undefined, /branches: any\./],
  ["protected branches", { protected_branches: true, custom_branch_policies: false }, undefined, /branches: protected branches\./],
  [
    "a second branch rule",
    protectedProduction.deployment_branch_policy,
    { branch_policies: [...mainOnly.branch_policies, { type: "branch", name: "release/*" }] },
    /branches: branch main, branch release\/\*\./,
  ],
];
for (const [name, policy, rules, message] of branchCases) {
  test(`production fails with ${name}`, () => {
    const answers = {
      [environmentPath("production")]: [200, { ...protectedProduction, deployment_branch_policy: policy }],
    };
    if (rules) answers[branchRulesPath] = [200, rules];
    assertFails(run({ environment: "production", answers }), message);
  });
}

test("production fails when its branch rules cannot be read", () => {
  const result = run({
    environment: "production",
    answers: { [environmentPath("production")]: [200, protectedProduction], [branchRulesPath]: [500, {}] },
  });
  assertFails(result, /GitHub answered 500 for the production branch rules/);
});

test("an unknown environment fails", () => {
  assertFails(run({ environment: "preview" }), /Usage:/);
});
