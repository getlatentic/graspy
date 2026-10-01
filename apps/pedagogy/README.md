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
npm run pedagogy -w @graspy/pedagogy -- --persona unsure --answers 8   # answers the page marked; an answer it could not hear does not count
npm run pedagogy -w @graspy/pedagogy -- --help
```

The personas are `sure`, `unsure`, `stuck`, `silent`, `offtopic` and `pidgin` (`src/personas.ts`). The Bedrock key is read from `AWS_BEARER_TOKEN_BEDROCK`, or from `apps/server/.dev.vars`.

A run writes `runs/<id>/transcript.md` (open it in any Markdown viewer that shows images), `run.json` and `shots/`. `runs/` is not committed.

## Keeping the recordings

Each answer's recording is kept in the run (`answers/NN.wav`), and `src/export-samples.ts` gathers every run's recordings into one folder with a `metadata.jsonl` (the words intended, what the recogniser heard, the marking, the class, plan and prompt, and how the voice was made) and a dataset card:

```bash
node apps/pedagogy/src/export-samples.ts --dest ~/workspace/afro-math-voices/graspy-simulated
```

Running it again adds only new recordings. Every record says `synthetic: true`. The voice is a cloned voice pitched up, so these are not children and not African-accented speakers: keep them apart from AfroMathVoices' real recordings, and use them for measuring how the recogniser hears spoken numbers, not for training on real speech.

## Reading a run

- **Mechanical findings** are checks that need no judgement: a right answer marked wrong, a wrong one accepted, a line repeated three times, the same feedback twice, a line too long for a child, silence answered with nothing, a long wait, an answer kept and never marked. A `recogniser-misheard` note means the speech recogniser, not the teacher, may be at fault: read the marking findings with it.
- **The judge** is `deepseek.v3.2` scoring seven criteria from 1 to 5 with quotes. It reads the transcript only.
- **Fidelity** is how much of what the child meant to say the recogniser produced, spoken numbers and digits counted as equal.

The checks and the judge point at things to read. They do not replace reading the transcript and looking at the screenshots.

## Tests

```bash
npm test -w @graspy/pedagogy && npm run lint -w @graspy/pedagogy
```
