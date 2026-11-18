// Appends the template cases whose ids are not in observation.jsonl yet (Node 24.2 or later).
//   node bench/add-template-cases.ts
import { appendRows, loadSet, sameWords } from "./observation-set.ts";
import { templateCases } from "./template-cases.ts";

const have = loadSet();
const ids = new Set(have.map((row) => row.id));
const texts = new Set(have.map(sameWords));
const fresh = templateCases().filter((row) => !ids.has(row.id) && !texts.has(sameWords(row)));
appendRows(fresh);
console.log(`${fresh.length} template cases added`);
