import { readFileSync } from "node:fs";
import { lessonScript } from "./script.ts";
import type { Run } from "./turn-log.ts";

/** Print the script of runs already kept: node src/script-cli.ts runs/<run>/run.json ... */
const scripts = process.argv.slice(2).map((file) => lessonScript((JSON.parse(readFileSync(file, "utf8")) as { run: Run }).run));
console.log(scripts.join("\n---\n\n"));
