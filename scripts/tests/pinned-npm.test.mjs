import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve(import.meta.dirname, "..", "pinned-npm.mjs");

function pinnedNpm(manifest) {
  const args = [script];
  if (manifest !== undefined) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "pinned-npm-")), "package.json");
    writeFileSync(file, JSON.stringify(manifest));
    args.push(file);
  }
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

test("names the repository's pinned npm", () => {
  const result = pinnedNpm();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^npm@\d+\.\d+\.\d+\n$/);
});

test("prints npm@<version> from packageManager", () => {
  const result = pinnedNpm({ packageManager: "npm@11.19.0" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "npm@11.19.0\n");
});

for (const packageManager of [undefined, "", "npm@11", "npm@^11.19.0", "pnpm@9.0.0", "npm@11.19.0+sha512.abc"]) {
  test(`fails on packageManager ${JSON.stringify(packageManager)}`, () => {
    const result = pinnedNpm({ packageManager });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /packageManager is not npm@<version>/);
  });
}
