# A turn that outlives its connection

Behind `DURABLE_TURNS=on` (staging first; it needs `CHAT_LOG=on`). The model of the problem is
`docs/specs/ChatTurn.tla`; the losses it removes are measured in `docs/CHAT_TURN_LOSS.md`.

## Flow

1. The A2A executor makes a `TurnJob` from the message (chat = context id, turn = message id) and asks the
   host to start it. The host keeps `turn.started {turn, job}` once per turn id, and wakes the chat's
   `ChatTurn` Durable Object (`apps/server/src/worker.py`).
2. The object's alarm runs `TurnRunner.advance` (`apps/server/src/app/turns/runner.py`): it finds the chat's
   oldest unfinished turn from the log, sets the watchdog alarm 30 s ahead, writes `turn.resumed`, and runs
   the tutor under a 120 s deadline, keeping `text`, `tool.started`, `tool` events as they happen.
3. The executor only reads: `follow` (`turns/relay.py`) polls the log for the turn's events and
   `agent/durable_relay.py` turns them into A2A updates. A reader that goes away does not stop the turn.

## Failure

| What happens | What the log shows |
|---|---|
| The isolate dies mid-run | The watchdog alarm rings; the next run writes `round.aborted cut_off` if words were kept, then `turn.resumed` with run + 1, and answers again under a new reply |
| A run raises or passes its deadline | `round.aborted` with the error name or `deadline`; retry after 2 s |
| Three runs in a row keep nothing, or five minutes pass | `turn.finished status=failed` with `cause` (`no_progress`, `stalled`, `unsafe_to_repeat`, `unreadable`) |
| A run was cut off with a tool call open | Repeated only if the tool is read-only (`agent/tools_known.py`); else the turn fails `unsafe_to_repeat` |

The exchange (`user` + `assistant`) is written once per turn id by `Tutor.stream`, by a unique index
(migration 0024), so any number of runs keeps it once.

## Measured on staging, 2026-11-04

`scripts/chat/turn_restart.py` sent a 20-step question every 5 s. A temporary build (not merged) called
`ctx.abort()` on the chat's object 6 s into its first run, which ends the isolate as a crash does. Five
turns, five finished replies, each by a second run after the 30 s watchdog:

| Turn | Total time | Runs | `round.aborted` | Exchanges kept |
|---|---|---|---|---|
| 1 | 38.6 s | 2 | none (nothing had been written before the kill) | 1 |
| 2 | 39.1 s | 2 | `cut_off` | 1 |
| 3 | 39.5 s | 2 | `cut_off` | 1 |
| 4 | 40.2 s | 2 | `cut_off` | 1 |
| 5 | 41.6 s | 2 | `cut_off` | 1 |

A redeploy was not a kill: 110 turns sent while staging was redeployed all finished with one run each. A turn
that cannot progress ends `failed` with a cause in the runner tests (`tests/test_turn_runner.py`,
`tests/test_durable_turn.py`); it was not forced on staging.

## Not here

The client still sends a new message id on each retry (`askAgent` in `apps/web/src/lib/a2a/client.ts`), so a
retry is a new turn; joining by id and a resume endpoint with a cursor are planning #710. Production has no
`CHAT_TURNS` binding yet.
