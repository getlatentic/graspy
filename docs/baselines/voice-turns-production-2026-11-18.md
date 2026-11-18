# Voice turns: production

- Database: `graspy`, read-only (SELECT only)
- Turns last updated: the first turn to now (UTC)
- Release: production at f2234ae, as the owner stated; taken before the next production deploy
- Taken: 2026-11-18 01:28 UTC

## Turns

| Turns | Complete | Failed | Processing | Other | Failed share | Learners |
|---|---|---|---|---|---|---|
| 139 | 103 | 36 | 0 | 0 | 25.9 % | 9 |

| Day (UTC) | Turns | Failed |
|---|---|---|
| 2026-09-05 | 14 | 1 |
| 2026-09-06 | 47 | 18 |
| 2026-09-07 | 33 | 10 |
| 2026-09-15 | 12 | 6 |
| 2026-09-21 | 1 | 1 |
| 2026-09-22 | 2 | 0 |
| 2026-09-26 | 1 | 0 |
| 2026-09-28 | 4 | 0 |
| 2026-09-30 | 24 | 0 |
| 2026-10-01 | 1 | 0 |

## What each completed turn was marked

Verdict and heard kind are empty for turns from before migration 0020. An `unheard` verdict is no try.

| Verdict | Heard kind | Turns | Share of complete |
|---|---|---|---|
| none | none | 103 | 100.0 % |

## Recognition

| Recognizer | Turns |
|---|---|
| intron_sync | 71 |
| sahara | 17 |
| whisper | 15 |

| Time (ms) | Turns | Median | p90 | Max |
|---|---|---|---|---|
| Recognition, from the database | 103 | 1737 | 7488 | 44814 |

## Safety rule

Completed turns whose reply is one of the authored need lines (a line the phrasebook held when the turn ran).

| Needs help (toilet, water) | Needs a grown-up |
|---|---|
| 0 | 0 |

## Time from recording to reply, from the logs

Not read: no `--logs` given. Stage times are in the Workers' logs only, not in the database.
