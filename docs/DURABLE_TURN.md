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

## Following a turn

A learner's page does not hold the turn; it follows it, and can follow it again from where it was.

- `POST /api/chats/{chat}/turns` (`api/chat_routes.py`) begins a turn with `{turn, parts, metadata}` and
  answers `{turn, cursor}`. The `turn` is the message id: sent again, it joins the turn it began. The chat
  is the learner's: another learner's chat answers 404, like a chat that does not exist.
- The turn's events reach the page as **frames** (`turns/frames.py`): `{seq, prev, kind, ...}`, where `seq`
  is the event's seq in the chat and `prev` the seq of the frame before it (the cursor, for the first). The
  page keeps the seq of the last frame it applied, drops a frame at or below it, and asks again from its
  cursor when a frame's `prev` is not its cursor. A cursor beyond the chat is answered `{kind: reset}`.
- **WebSocket** `wss://<api>/api/chats/{chat}/turns/{turn}/socket?after=<seq>`, offering the subprotocols
  `graspy.v1` and the session token (a browser cannot set `Authorization` on a socket). The Worker checks
  the token, the origin and the chat's owner (`cloudflare_sockets.py`), then hands the upgrade to the chat's
  `ChatTurn` object, which accepts it hibernatably. The object is told after every event the runner keeps
  (`TurnRunner(announce=...)`) and sends each socket the frames after that socket's cursor
  (`turns/sockets.py`); the cursor is the socket's attachment, so it survives hibernation. The same read
  serves a socket opened late. The page sends the text `ping` and is answered `pong` by the runtime without
  waking the object, and sends `{"type": "stop"}` to stop the turn.
- **Server-sent events** `GET /api/chats/{chat}/turns/{turn}/events` (cursor in `Last-Event-ID` or
  `?after=`) are the way in when a socket cannot be opened. The request reads the log for 20 s at most
  (a request that read it for ten minutes would spend the Worker's query limit) and the page asks again.
- **Stop** (`POST .../stop`, or the socket message) writes `turn.stop`, ends the run that is writing the
  turn, then the next step of the runner marks each open tool `tool.cancelled`, keeps the exchange with the
  words so far (a stop before any words keeps nothing; the page sends the message as unanswered with the next one), and finishes the turn `status=stopped` with those words as the reply. A stop is in the
  log, so a restart finds it.

**Android** (`apps/mobile/.../ask/TutorRun.kt`) keeps the A2A `SendStreamingMessage` as the way a turn begins, with
the thread's `contextId` (a new chat's id is made on the phone) and one `messageId` per question, which is the turn
id. A stream that drops after it opened is followed by server-sent events from cursor 0 (the A2A stream carries no
seq), with `Last-Event-ID` from the last frame applied after that; what the A2A stream had shown is withdrawn, as the
frames show the turn again. A read that is answered 404 means the message began no turn, so it is sent again with
the same id. Stop is the `POST .../stop` route; the turn ends `stopped` and its words are kept as the reply. No
socket: server-sent events only.

Limits: a chat's object holds at most 8 sockets, and a socket is opened only for a turn the chat holds. A start spends the agent budget, as an A2A message does. The socket is opened by the Worker
before the app's middleware, so it spends none; it needs a valid session and the chat's owner.

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

The web's fallback `askAgent` (`apps/web/src/lib/a2a/client.ts`) still sends a new message id on each retry.
Production has no `CHAT_TURNS` binding yet.
