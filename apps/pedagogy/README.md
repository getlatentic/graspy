# graspy pedagogy test

A simulated child takes a voice lesson in the real web app, and the run is kept for review: the teacher's lines, what the child meant to say, what the recogniser heard, how the answer was marked, a screenshot of each question and result, and a list of things worth a second look.

Nothing here runs in production. It needs the local stack from [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md): the API Worker, the tutor Worker and the web app, with `INTRON_API_KEY` and `SPITCH_API_KEY` in `apps/server/.dev.vars`, and a signed-out device (voice lessons run only there locally).

## What is real and what is simulated

- The web app, the API, the tutor, Intron's recognition and Spitch's teacher voice are the real ones.
- The child's words come from `openai.gpt-oss-120b` on Bedrock, playing a persona. It is never an Anthropic model: graspy's work does not use one, and that includes its tests.
- The child's voice is yarngo studio's cloned voice, pitched up, and levelled to what the app counts as speech. It is played into the page's microphone stream (`getUserMedia` answers with a stream fed from an audio graph), so the app's own recorder, endpoint detection and upload run as with a child. The system microphone is not involved, and nothing changes on the Mac's audio settings.
- Onboarding is driven through the real screens the first time; the device is then saved under `runs/.state` so later runs skip building a plan.

## Run

```bash
npm run pedagogy -w @graspy/pedagogy -- --persona unsure --answers 8
npm run pedagogy -w @graspy/pedagogy -- --help
```

The personas are `sure`, `unsure`, `stuck`, `silent`, `offtopic` and `pidgin` (`src/personas.ts`). The Bedrock key is read from `AWS_BEARER_TOKEN_BEDROCK`, or from `apps/server/.dev.vars`.

A run writes `runs/<id>/transcript.md` (open it in any Markdown viewer that shows images), `run.json` and `shots/`. `runs/` is not committed.

## Reading a run

- **Mechanical findings** are checks that need no judgement: a right answer marked wrong, a wrong one accepted, a line repeated three times, the same feedback twice, a line too long for a child, silence answered with nothing, a long wait, an answer kept and never marked. A `recogniser-misheard` note means the speech recogniser, not the teacher, may be at fault: read the marking findings with it.
- **The judge** is `deepseek.v3.2` scoring seven criteria from 1 to 5 with quotes. It reads the transcript only.
- **Fidelity** is how much of what the child meant to say the recogniser produced, spoken numbers and digits counted as equal.

The checks and the judge point at things to read. They do not replace reading the transcript and looking at the screenshots.

## Tests

```bash
npm test -w @graspy/pedagogy && npm run lint -w @graspy/pedagogy
```
