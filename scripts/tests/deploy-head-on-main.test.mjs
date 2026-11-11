// Runs deploy.sh's require_head_on_main in real clones of a real origin: production may deploy
// the commit a run started on while that commit is on main, and never one that is not.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = readFileSync(path.resolve(import.meta.dirname, "..", "deploy.sh"), "utf8");
const start = script.indexOf("require_head_on_main() {");
const FUNCTION = script.slice(start, script.indexOf("\n}\n", start) + 3);

const git = (cwd, ...args) => {
  const run = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
};

function commit(repo, name, file = name) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), name);
  git(repo, "add", file);
  git(repo, "commit", "-q", "-m", name);
  return git(repo, "rev-parse", "HEAD");
}

// An origin whose main has commits a, b, and a clone of it. `setup` moves origin and the clone.
function scenario({ shallow = false, setup }) {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-head-"));
  const origin = path.join(dir, "origin");
  git(dir, "init", "-q", "-b", "main", origin);
  const a = commit(origin, "a");
  const b = commit(origin, "b");
  const clone = path.join(dir, "clone");
  git(dir, "clone", "-q", ...(shallow ? ["--depth", "1"] : []), `file://${origin}`, clone);
  setup({ origin, clone, a, b });
  const run = spawnSync(
    "bash",
    ["-c", `set -euo pipefail; die() { echo "deploy: $*" >&2; exit 1; }\n${FUNCTION}\nrequire_head_on_main`],
    { cwd: clone, encoding: "utf8" },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

test("HEAD is main: deployed, nothing said about main moving", () => {
  const run = scenario({ setup: () => {} });
  assert.equal(run.status, 0, run.output);
  assert.doesNotMatch(run.output, /has moved on/);
});

test("HEAD is behind main: the approved commit is deployed and the output says main moved", () => {
  const run = scenario({
    setup: ({ origin, clone, b }) => {
      git(clone, "checkout", "-q", "--detach", b);
      commit(origin, "c");
      commit(origin, "d");
    },
  });
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /main has moved on by 2 commit\(s\)/);
});

test("HEAD is behind main in the workflow's shallow checkout", () => {
  const run = scenario({
    shallow: true,
    setup: ({ origin }) => {
      commit(origin, "c");
      commit(origin, "d");
      commit(origin, "e");
    },
  });
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /main has moved on by 3 commit\(s\)/);
});

test("HEAD is not on main in the workflow's shallow checkout: refused", () => {
  const run = scenario({
    shallow: true,
    setup: ({ origin, clone }) => {
      commit(clone, "side");
      commit(origin, "c");
    },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.output, /is not on it/);
});

test("HEAD is not on main: refused, with how to run again", () => {
  const run = scenario({
    setup: ({ clone, b }) => {
      git(clone, "checkout", "-q", "--detach", b);
      commit(clone, "side");
    },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.output, /is not on it \(main is [0-9a-f]+\)\. Start the Deploy workflow again from main\./);
});

test("HEAD is not on main, and main has moved: still refused", () => {
  const run = scenario({
    setup: ({ origin, clone, b }) => {
      git(clone, "checkout", "-q", "--detach", b);
      commit(clone, "side");
      commit(origin, "c");
    },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.output, /is not on it/);
});

test("HEAD is behind main and main has a migration HEAD lacks: refused", () => {
  const run = scenario({
    setup: ({ origin, clone, b }) => {
      git(clone, "checkout", "-q", "--detach", b);
      commit(origin, "c", "apps/server/migrations/0001_new.sql");
    },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.output, /main \([0-9a-f]+\) has migrations that [0-9a-f]+ lacks/);
});

test("HEAD is behind main and only code outside migrations changed: deployed", () => {
  const run = scenario({
    setup: ({ origin, clone, b }) => {
      git(clone, "checkout", "-q", "--detach", b);
      commit(origin, "c", "apps/web/page.txt");
    },
  });
  assert.equal(run.status, 0, run.output);
});
