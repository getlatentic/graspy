// Maths the model wrote with no delimiters: \begin{pmatrix}...\end{pmatrix},
// A = \pi r^2, \frac{d}{dx}\left[ x^2 \right] = 2x. Each such formula is tagged
// as one <latex-inline>.
//
// Environments and braced groups are found first, by search, and stand in the
// text as one private-use character each, so no scan counts their contents; one
// over its cap, or that crosses a blank line, is a plain word that poisons the
// run beside it. latex-reader.ts reads what is left.
//
// This is apps/server/src/app/domains/lesson/maths_runs.py, which the server
// applies to a reply; tests/fixtures/math-repair.json holds the cases both must
// agree on. apps/server/ui/src/shared/latex-runs.ts is this file's twin.

import {
  END,
  ENVIRONMENT,
  GROUP,
  MARKS,
  PLAIN,
  restore,
  tagRuns,
} from "./latex-reader";
import { MAX_DISPLAY, MAX_INLINE, Searcher, mapUnprotected } from "./latex-scan";
import { ENVIRONMENTS } from "./latex-vocabulary";

export {
  FUNCTIONS,
  INFIX,
  NAMES,
  RENAMED_ENVIRONMENTS,
  UNWRAPPED_ENVIRONMENTS,
} from "./latex-reader";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const BEGIN_SOURCE = String.raw`\\begin\{(${ENVIRONMENTS.map(escapeRegExp).join("|")})\}`;

function token(mark: string, store: string[], text: string): string {
  store.push(text);
  return `${mark}${store.length - 1}${END}`;
}

function protectEnvironments(text: string, store: string[]): string {
  const index = new Searcher(text);
  const begin = new RegExp(BEGIN_SOURCE, "g");
  const pieces: string[] = [];
  let done = 0;
  let search = 0;
  for (;;) {
    begin.lastIndex = search;
    const opener = begin.exec(text);
    if (!opener) break;
    const after = opener.index + opener[0].length;
    const close = `\\end{${opener[1]}}`;
    const end = index.find(close, after, index.paragraphEnd(after));
    if (end < 0) {
      search = after;
      continue;
    }
    const stop = end + close.length;
    const mark = stop - opener.index > MAX_DISPLAY ? PLAIN : ENVIRONMENT;
    pieces.push(
      text.slice(done, opener.index),
      token(mark, store, text.slice(opener.index, stop)),
    );
    done = search = stop;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

function outermostGroups(text: string): [number, number][] {
  const index = new Searcher(text);
  const opened: number[] = [];
  const pairs: [number, number][] = [];
  for (const brace of text.matchAll(/\\[\s\S]|[{}]/g)) {
    if (brace[0] === "{") {
      opened.push(brace.index);
    } else if (brace[0] === "}" && opened.length) {
      const start = opened.pop()!;
      if (index.paragraphEnd(start) >= brace.index + 1) {
        pairs.push([start, brace.index + 1]);
      }
    }
  }
  const groups: [number, number][] = [];
  let lastEnd = 0;
  for (const [start, end] of pairs.sort((a, b) => a[0] - b[0])) {
    if (start >= lastEnd) {
      groups.push([start, end]);
      lastEnd = end;
    }
  }
  return groups;
}

function protectGroups(text: string, store: string[]): string {
  const pieces: string[] = [];
  let done = 0;
  for (const [start, end] of outermostGroups(text)) {
    const mark = end - start > MAX_INLINE ? PLAIN : GROUP;
    pieces.push(text.slice(done, start), token(mark, store, text.slice(start, end)));
    done = end;
  }
  pieces.push(text.slice(done));
  return pieces.join("");
}

function tagSegment(segment: string): string {
  if (!segment.includes("\\") || new RegExp(MARKS).test(segment)) return segment;
  const store: string[] = [];
  const protectedText = protectGroups(protectEnvironments(segment, store), store);
  return restore(
    tagRuns(protectedText, (piece) => restore(piece, store)),
    store,
  );
}

/** Each formula written with no delimiters tagged. */
export function tagBareMaths(text: string): string {
  return mapUnprotected(text, tagSegment);
}
