// Prints the npm that wrote package-lock.json, as npm@<version>, from package.json's
// packageManager. Another npm can install less than the lockfile names and not fail, so CI and
// scripts/deploy.sh install with this one: npx --yes "$(node scripts/pinned-npm.mjs)" ci
//
//   node scripts/pinned-npm.mjs [package.json]
import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = process.argv[2] ?? path.resolve(import.meta.dirname, "..", "package.json");
const { packageManager = "" } = JSON.parse(readFileSync(manifest, "utf8"));
const version = /^npm@(\d+\.\d+\.\d+)$/.exec(packageManager)?.[1];
if (!version) {
  console.error(`${manifest}'s packageManager is not npm@<version>: "${packageManager}".`);
  process.exit(1);
}
console.log(`npm@${version}`);
