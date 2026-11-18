# Voice turns: staging

- Database: `graspy-staging`, read-only (SELECT only)
- Turns last updated: the first turn to now (UTC)
- Release: staging, which follows main; the commit running was not checked
- Taken: 2026-11-18 01:28 UTC

## Turns

| Turns | Complete | Failed | Processing | Other | Failed share | Learners |
|---|---|---|---|---|---|---|
| 966 | 943 | 22 | 1 | 0 | 2.3 % | 134 |

| Day (UTC) | Turns | Failed |
|---|---|---|
| 2026-09-27 | 1 | 0 |
| 2026-09-29 | 76 | 16 |
| 2026-09-30 | 315 | 3 |
| 2026-10-01 | 242 | 3 |
| 2026-10-02 | 254 | 0 |
| 2026-11-07 | 68 | 0 |
| 2026-11-18 | 10 | 0 |

## What each completed turn was marked

Verdict and heard kind are empty for turns from before migration 0020. An `unheard` verdict is no try.

| Verdict | Heard kind | Turns | Share of complete |
|---|---|---|---|
| none | none | 382 | 40.5 % |
| correct | none | 271 | 28.7 % |
| unheard | dont_know | 92 | 9.8 % |
| wrong | none | 82 | 8.7 % |
| unheard | conversation | 71 | 7.5 % |
| unheard | garbled | 45 | 4.8 % |

## Recognition

| Recognizer | Turns |
|---|---|
| nova | 414 |
| intron_sync | 272 |
| whisper | 257 |

| Time (ms) | Turns | Median | p90 | Max |
|---|---|---|---|---|
| Recognition, from the database | 943 | 951 | 2742 | 44526 |

## Safety rule

Completed turns whose reply is one of the authored need lines (a line the phrasebook held when the turn ran).

| Needs help (toilet, water) | Needs a grown-up |
|---|---|
| 6 | 8 |

## Time from recording to reply, from the logs

Not read: no `--logs` given. Stage times are in the Workers' logs only, not in the database.
