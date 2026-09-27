// Fails when a package a workspace declares is not installed in this repository where Node looks
// for it. npm 11.6.2 skipped the tutor workspace's packages without an error.
//
//   node scripts/require-installed.mjs apps/tutor apps/web
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// A node_modules above the repository (a checkout this one is nested in) is not what a deploy
// builds with.
const repository = path.resolve(import.meta.dirname, "..") + path.sep;

function isInstalled(name, workspaceRequire) {
  return (workspaceRequire.resolve.paths(name) ?? [])
    .filter((dir) => dir.startsWith(repository))
    .some((dir) => existsSync(path.join(dir, name, "package.json")));
}

function missingPackages(workspace) {
  const manifest = path.resolve(workspace, "package.json");
  const { dependencies = {}, devDependencies = {} } = JSON.parse(readFileSync(manifest, "utf8"));
  const workspaceRequire = createRequire(manifest);
  return Object.keys({ ...dependencies, ...devDependencies }).filter(
    (name) => !isInstalled(name, workspaceRequire),
  );
}

const missing = process.argv
  .slice(2)
  .flatMap((workspace) => missingPackages(workspace).map((name) => `${workspace}: ${name}`));
if (missing.length > 0) {
  console.error(`Not installed:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
