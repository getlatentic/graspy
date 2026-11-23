# The maths repair

The tutor's maths arrives as LaTeX written however the model likes: delimited or not, with commands KaTeX does not know, with text where maths goes. The repair makes it something the chat's markdown reader (remark-math, then KaTeX) shows right.

| Where | Files | What it repairs |
|---|---|---|
| Server (Python) | `apps/server/src/app/domains/lesson/maths*.py`, `markdown.py` | Chat answers (`reply_text`, in `agent/tutor.py` and `turns/job.py`) and a lesson's fields (`repair_markdown`, in `lesson/service.py`), before any client sees them |
| Web (TypeScript) | `apps/web/src/lib/latex*.ts` | Text that never passed the server: lessons stored before a rule existed, replies still streaming |
| Lesson views (TypeScript) | `apps/server/ui/src/shared/latex*.ts` | The same text in the MCP views. Each file is a copy of the web's |

`tests/fixtures/math-repair.json` (547 cases) holds the input and the output each must give. `apps/server/tests/test_math_repair_corpus.py`, `apps/web/src/lib/latex.test.ts` and `apps/server/ui/src/shared/latex.test.ts` read it, and the Python test fails when a view's file differs from the web's. Android's `reply.js` only turns the server's `<latex-*>` tags into `$`, so a rule that works on a span of maths reaches it through the server.

## Why more than one implementation

Two are forced. The server repairs before it sends: its clients are the web, Android and MCP assistants, and the last two run no repair of their own. The server runs Python in a Worker with no KaTeX, so its repair is Python. The web repairs text that was stored or is still arriving, so its repair runs in the browser. The third copy, in `apps/server/ui`, is not forced. The test says why it exists ("the views cannot import from the web app"), and `apps/server/ui` is already an npm workspace, so a shared package would remove the eight copied files. That is packaging work, and it is not done here.

## Words in a math font

`\mathrm{Akwa Ibom}` is valid LaTeX and KaTeX shows "AkwaIbom": maths mode drops spaces, and a font command only changes the letters. Measured with KaTeX 0.16.27:

| Source | KaTeX shows |
|---|---|
| `\mathrm{Akwa Ibom}` | AkwaIbom |
| `\text{Akwa Ibom}` | Akwa Ibom |
| `a \mathrm{ and } b` | aandb |
| `a \text{ and } b` | a and b |
| `\mathbf{Key idea}`, `\boldsymbol{Key idea}`, `\bm{Key idea}`, `\pmb{Key idea}`, `\mathnormal{Key idea}` | Keyidea |
| `\textbf{Key idea}` | Key idea |
| `\operatorname{ess sup} f` | esssupf |
| `x_{\mathrm{max value}}` | xmaxvalue |
| `x_{\text{max value}}` | xmax value |

`maths_fonts.py` and `latex-fonts.ts` write the group as a text command: `\mathrm` and `\operatorname` as `\text`; `\mathbf`, `\boldsymbol`, `\bm` and `\pmb` as `\textbf`; `\mathit` and `\mathnormal` as `\textit`; `\mathsf` as `\textsf`; `\mathtt` as `\texttt`. The group has words when its blank-separated tokens are two or more and one is a word (two letters or more, punctuation allowed between them, as in `re-do`), or when it is one word with a blank before or after it (`\mathrm{ and }`, the way a model most often writes it). The characters must be letters (any plane), marks, digits or `.,;:!?'’()-`.

Left alone:
- a symbol or a name with no blank round it: `\mathrm{d}`, `\mathbf{v}`, `\mathrm{km}`;
- a single letter with blanks round it, `\mathrm{ d }`, which shows right as it is;
- single letters, `\mathrm{m s}`;
- a group with a command, brace, script, slash, operator or other character of maths: `\mathrm{km/h}`, `\mathrm{m s^{-1}}`, `\mathrm{a + b}`, `\mathrm{Akwa\ Ibom}`;
- `\operatorname` with one token (`\operatorname{ sin }`), or with all tokens an operator's own words, `arg`, `ess`, `max`, `min`, `sup`, `inf`, `lim` (`\operatorname{arg max}`, `\operatorname{ess sup}`: the operator name is what is meant);
- `\operatorname*`, a limit operator;
- `\mathbb`, `\mathcal` and `\mathfrak`, which have no text command (a known limit, pinned by corpus cases);
- a command that only begins with one of these names (`\bmod`, `\pmod`, `\mathrmx`), and a command after an odd number of backslashes (`\\mathrm`, a line break and then the word).

A unit such as `\mathrm{kg m}` becomes `\text{kg m}`, which shows the space it was written with.

## Could KaTeX drive the repair?

`scripts/measure-math-repair.mjs` (`npm install`, then `node scripts/measure-math-repair.mjs --list`) looks at each text three ways as the chat reads it: as written, with only its delimiters found (what KaTeX alone is given), and repaired. It parses every formula with `throwOnError: true`. `scripts/measure-math-repair-loop.mjs` is the generic repair tried: parse, read the error's class and position, apply the one fix for that class, parse again, at most eight times.

Two kinds of text are measured, and neither is a sample of the model's traffic:
- The corpus is a list of failures that were found and of text that must stay as it is. It is read here as the 486 cases of the earlier repair; the 61 cases written with the font rule are left out of the figures below, as they are made of that rule's own class.
- The 1 511 fields with maths in the 96 lessons of the grounding study (`docs/baselines/grounding/lessons.json.gz`) were stored after the server's repair, with their maths in `<latex-*>` tags. They show what the repair leaves, not what the model wrote.

The model's raw output was not measured: no unrepaired answers are in the repository.

Corpus, the 486 earlier cases:

| What the repair did | Texts |
|---|---|
| Found maths where KaTeX had nothing to read (bare commands and environments, `\[` after text, display layout) | 194 |
| Nothing inside the formulas: the delimiters were enough | 114 |
| Fixed a formula that does not parse | 74 |
| Changed a formula that parsed clean and showed wrong | 5 |
| No maths, none made | 28 |
| Right as written | 11 |
| Left wrong on purpose or by a known limit | 60 (18 with a KaTeX error, 42 with LaTeX source in the prose) |

The loop on the 74 that fail to parse: 35 parse clean and 5 show what the rules show. The other 30 that parse show something else: a `_` in a `\text` is escaped and shows `OCH_2CH_3`, where the rule writes a subscript. Of the 39 that stay broken, 32 are errors that name `\cdotp`, a command the author never wrote (KaTeX's own name for `·` in text), so no fix can be keyed on the message. On the 18 texts the repair leaves with a parse error, the loop parses 11.

Lessons, as stored after the server's repair, 1 511 fields: 1 508 are right with only their delimiters found. 3 fail, all `\begin{array}{c@{}c@{}c}`, whose `@{}` column specification KaTeX refuses (`Unknown column alignment: @`). No rule covers it; the loop parses 2 of the 3. That is 0.2% of fields after the repair, and says nothing of the rate in raw output. No lesson has words in a font command.

KaTeX's strict mode is no gate: 172 distinct formulas of the lessons (165 with `unknownSymbol`, such as a `₦` or a narrow no-break space) are flagged although KaTeX sets them without trouble.

### Which failures are which

(a) A parse error KaTeX names, fixable by a loop: a stray `&`, `_` or `#`, an unclosed group or `\left`, a double script, a display-only environment, a column specification with `@{}`. The loop makes these parse, but parse is not right: of the 74 formulas it parses 35 and shows the rules' result for 5. A loop is a safety net that keeps the source off the screen, and a poor way to decide what the learner sees.

(b) Parses clean, shows wrong: words in a math font (above), a price read as maths (`$5 and $10`), characters in `\text` that KaTeX prints as commands. KaTeX cannot see these. Each needs a rule that knows what the model meant. The earlier corpus has 5 such texts and the staging bug is another; the font rule closes the class "words with spaces in a math font".

(c) Not a formula KaTeX is given: delimiters missing, display maths after text, bare environments, `$` in prose. 194 of the 486 earlier cases. Nothing to loop on.

(d) Better prevented at the source: the model is told one rule per class and asked again when its answer breaks one. From the planning discussion (not measured again here): the model uses an optional validator tool 14 to 28% of the time, so the server-side gate with the `AnswerRestart` event was chosen. Broken answers fell from 3.0% to 0.4% on 507 answers and from 11% to 1.7% on a hold-out of 300.

### Recommendation

1. Keep the rules for (b) and (c): 199 of the 486 earlier cases (41%) are invisible to KaTeX or parse clean. This is a share of a list of known failures, not of traffic. A generic loop does not replace them.
2. Do not rewrite the engine as a loop. It parses 47% of the formulas that fail and shows the right thing for 7%.
3. Prevent at the source for what the rules cannot know: the gate in (d), with the answer restarted once when its maths breaks a rule. A gate needs a checker the server can run; each new bug adds one case to the corpus and one detector.
4. Add the loop's exact fixes only where the corpus shows the fix is right, starting with the `@{}` column specification (3 of 1 511 stored lesson fields). Counting KaTeX's parse errors in the web's render path on real traffic (class name only, no text) would give the rate that the stored lessons and the corpus cannot.
5. Replace the copied views files with a shared workspace package, so the TypeScript repair has one home and the Python one remains its twin.

Not verified here: the rate of broken answers in the model's raw output or on staging (the numbers in (d) are from the planning discussion), how often words in a font command occur in chat answers, and the Android WebView, which gets the server's repaired text.
