// Writes the commands and environments KaTeX itself accepts into the three
// places that repair the tutor's undelimited maths, and into the corpus that
// holds them equal:
//
//   apps/server/src/app/domains/lesson/maths_vocabulary.py
//   apps/web/src/lib/latex-vocabulary.ts
//   apps/server/ui/src/shared/latex-vocabulary.ts
//   tests/fixtures/math-repair.json  ("vocabulary")
//
// Run it again after upgrading katex: node scripts/generate-math-vocabulary.mjs
//
// KaTeX does not list its commands, so each name that appears in its source
// (and mhchem's) is tried: one KaTeX calls an undefined control sequence is not
// a command, and the rest are. Environments are tried the same way, and one
// that KaTeX refuses outside display mode is display-only.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
const katex = (await import(require.resolve("katex/dist/katex.mjs"))).default;
await import(require.resolve("katex/dist/contrib/mhchem.mjs"));

const sources = [
  readFileSync(require.resolve("katex/dist/katex.mjs"), "utf8"),
  readFileSync(require.resolve("katex/dist/contrib/mhchem.mjs"), "utf8"),
].join("\n");

// Commands that define, load or link: text that has one is not the tutor's
// maths, and begin and end are the environments' own.
const NEVER = new Set(
  (
    "begin end def gdef edef xdef let futurelet newcommand renewcommand providecommand " +
    "global long outer relax href url includegraphics htmlClass htmlId htmlStyle htmlData " +
    "verb input include expandafter noexpand csname endcsname"
  ).split(" "),
);

const messageOf = (render) => {
  try {
    render();
    return "";
  } catch (error) {
    return String(error.message);
  }
};

const commands = [
  ...new Set([...sources.matchAll(/\\{1,2}([A-Za-z]+)/g)].map((m) => m[1])),
]
  // One letter is an accent or a blackboard shortcut KaTeX takes, and a C or
  // regex escape (\r, \v, \u) the tutor's text may hold.
  .filter((name) => name.length > 1 && !NEVER.has(name))
  .filter(
    (name) =>
      !messageOf(() =>
        katex.renderToString(`\\${name}`, { throwOnError: true, strict: false }),
      ).includes("Undefined control sequence"),
  )
  .sort();

const environments = [];
const displayOnly = [];
for (const word of new Set(
  [...sources.matchAll(/"([A-Za-z]+\*?)"/g)].map((m) => m[1]),
)) {
  const body = `\\begin{${word}} a \\end{${word}}`;
  const inline = messageOf(() =>
    katex.renderToString(body, { throwOnError: true, strict: false }),
  );
  if (inline.includes("No such environment")) continue;
  environments.push(word);
  if (inline.includes("display mode")) displayOnly.push(word);
}
environments.sort();
displayOnly.sort();

const list = (words) => words.join(" ");

writeFileSync(
  join(root, "apps/server/src/app/domains/lesson/maths_vocabulary.py"),
  `"""The commands and environments KaTeX accepts, written by
scripts/generate-math-vocabulary.mjs: do not edit."""

_COMMANDS = ${JSON.stringify(list(commands))}
_ENVIRONMENTS = ${JSON.stringify(list(environments))}
_DISPLAY_ONLY_ENVIRONMENTS = ${JSON.stringify(list(displayOnly))}

COMMANDS = _COMMANDS.split()
ENVIRONMENTS = _ENVIRONMENTS.split()
DISPLAY_ONLY_ENVIRONMENTS = _DISPLAY_ONLY_ENVIRONMENTS.split()
`,
);

const typescript = `// The commands and environments KaTeX accepts, written by
// scripts/generate-math-vocabulary.mjs: do not edit.

const words = (list: string) => list.split(" ");

export const COMMANDS = words(
  ${JSON.stringify(list(commands))},
);
export const ENVIRONMENTS = words(
  ${JSON.stringify(list(environments))},
);
export const DISPLAY_ONLY_ENVIRONMENTS = words(
  ${JSON.stringify(list(displayOnly))},
);
`;
writeFileSync(join(root, "apps/web/src/lib/latex-vocabulary.ts"), typescript);
writeFileSync(
  join(root, "apps/server/ui/src/shared/latex-vocabulary.ts"),
  typescript,
);

const corpusPath = join(root, "tests/fixtures/math-repair.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
corpus.vocabulary = {
  ...corpus.vocabulary,
  commands,
  environments,
  displayOnlyEnvironments: displayOnly,
};
delete corpus.vocabulary.functions;
writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);

console.log(
  `${commands.length} commands, ${environments.length} environments (${displayOnly.length} display-only)`,
);
