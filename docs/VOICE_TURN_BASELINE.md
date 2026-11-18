# Voice turn baseline

`apps/server/scripts/voice/turn_baseline.py` reports how the web voice lessons' turns are doing, so a later change can be compared with the numbers before it. It reads and never writes.

```bash
cd apps/server
uv run python scripts/voice/turn_baseline.py production --release <commit> --out ../../docs/baselines/voice-turns-production-<date>.md
uv run python scripts/voice/turn_baseline.py staging --since 2026-10-06 --until 2026-10-13 --logs tail.json
```

## What it reads

- **D1**, with `wrangler d1 execute --remote`, under wrangler's own login. `d1_select.py` refuses anything but one SELECT before it leaves the machine, so a production read cannot change production. The range is on `tutoring_turns.updated_at` (days in UTC, `--until` exclusive).
- **The Workers' log lines** (`--logs`, optional): a `wrangler tail --format json` capture or a Workers Logs export of the API and the tutor. They give the time from recording to reply per turn (`fetch_audio + detect_language + transcribe + teach`, joined by the turn id, the last six characters of the sample id) and per part (`mark`, `guard`, `rewrite` and the rest of the tutor's parts), and the safety-rule activations `observer-shadow` logs. Logs are kept only in Workers Logs, and the rule logs only where `OBSERVER` shadows (staging), so they cannot be read back from the database.

## What it prints

Turns by state, by day and failed share; learners (a count); completed turns by verdict and heard kind; recognizer and recognition time (median, p90, max) from `latency_ms`; and how many completed turns got one of the phrasebook's authored need lines (`needs_help`, `needs_grownup`), which is the safety rule's answer on every deployment because the rule runs before any model. That count compares a reply with the authored lines inside the query: lines that were changed since a turn ran are missed.

No transcript, audio, error text, learner or sample id is selected or printed. `tests/test_turn_baseline.py` runs the real queries on rows full of marked secrets and fails if any appears.

## Baselines

| File | Taken | What |
|---|---|---|
| [voice-turns-production-2026-11-18.md](baselines/voice-turns-production-2026-11-18.md) | 2026-11-18 | Production at f2234ae, before the next production deploy: 139 turns, 36 failed. No turn has a verdict yet (the last turn is 2026-10-01; migration 0020 came after). |
| [voice-turns-staging-2026-11-18.md](baselines/voice-turns-staging-2026-11-18.md) | 2026-11-18 | Staging, to show what verdicts and heard kinds look like. Its children are simulated. |

Production's time from recording to reply is not in these files: the wrangler login has no Workers Observability scope, so the logs cannot be read from here. To add it, export the API and tutor logs for the range from the dashboard (Workers & Pages, the Worker, Logs) or run `npx wrangler tail graspy-web-api --format json > tail.json` and `graspy-tutor` the same way during a lesson, then run the script with `--logs`. The same report is to be taken again after the next production deploy.
