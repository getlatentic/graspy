# What a chat turn loses when the connection is cut

Measured on 2026-11-03 with `apps/server/scripts/chat/turn_loss.py`, against the API under uvicorn on a laptop and against the staging Worker. Five runs per scenario, each in fresh conversations, with `gpt-oss-120b` on Bedrock answering. [docs/specs/ChatTurn.tla](specs/README.md) models what these numbers and the code say.

## Method

A turn carries a random code word ("My code word is zebra-4821"). A later turn in the same conversation asks for it, so "kept" means the conversation store held the cut-off exchange. The harness reads nothing from the server's own state: it sees what a learner would see. The client is the Python A2A SDK speaking JSON-RPC over the same endpoint as the web app.

## Results

| Scenario | Local | Staging |
|---|---|---|
| A whole turn: the exchange is kept | 5/5 | 5/5 |
| The client leaves as soon as the task exists: the exchange is kept | 5/5 | 24/25 |
| The client leaves at the first words: the exchange is kept | 5/5 | 5/5 |
| The client leaves, then asks for the same task again (`SubscribeToTask`): the stream ends finished | 5/5 | 5/5 |
| A second message is sent 1 s after the first, in one conversation: all three exchanges kept, both turns finished | 5/5 | 5/5 |
| The client leaves, then sends the same message again 0.6 s later, as the web app does: the conversation holds the message **twice** | 5/5 | 5/5 |

A whole turn takes about 3.6 s locally and 4.9 s on staging (medians), and the first words arrive at 2.8 s and 3.9 s. The words come in a burst of a few updates within half a second of each other, so a stream that drops at the first words has under a second of work left.

## What it shows

1. **A dropped stream does not stop the turn.** The A2A SDK keeps consuming a turn after the client leaves (`DefaultRequestHandler.on_message_send_stream` catches the cancellation and continues in the background), and the staging Worker did the same: the exchange was kept 29 times out of 30 when the client left at the first words or at the start.
2. **Because the turn survives, the retry duplicates it.** The web client sends a message again once after a retryable failure when no words had arrived (`apps/web/src/lib/a2a/client.ts`, `askAgent`). The first turn, still running on the server, finishes and appends its exchange; the second does too. The conversation holds the message twice, in 10 of 10 runs. This is the counterexample TLC finds for `AtMostOnce` in the spec.
3. **Resubscribing works, here.** A client that left can ask for the same task and receive the rest of the stream, to completion, 10 of 10 times. The task store is per isolate (`InMemoryTaskStore` in `apps/server/src/app/agent/a2a.py`); staging has little traffic, so both requests probably reached one isolate. A resubscribe that lands on another isolate was not measured, and would not find the task.
4. **Two messages in flight do not corrupt each other.** With a second message sent a second after the first, both turns finished and all three exchanges were kept, in 10 of 10 runs.

## What the measurements cannot show

- **An isolate dying mid-turn.** Killing the local process loses the in-memory conversation store, which on a Worker is a Durable Object that survives; and a deploy does not stop in-flight requests on Workers. What happens is from the code and the spec: the exchange is appended once, when the model finishes (`Tutor.stream` in `apps/server/src/app/agent/tutor.py`), so a turn cut off before that leaves nothing: not the message, not the reply. The client then shows an error, and the message comes back only if the learner sends it again. The spec's `EventuallyKept` is that case.
- **One staging run lost its exchange** after an immediate drop. It was not reproduced in 20 more runs. Either the exchange was not kept, or the recall turn answered wrongly. The model repeated a random code word correctly in all of the more than 60 other recalls, so a loss is the likelier reading, but this is not proven and the cause is not known.
- **Android.** Nothing here ran against the Android app.
- **Limits of the Workers runtime.** Turns here took about 5 s. A turn near the wall or CPU limit was not tried.

## What it means for the durable chat

- The turn has to be written before work starts and resumed by something other than the client: a crash today loses the message, and nothing but the learner's resend brings it back.
- A message the server has already seen has to be joined by its id, not run again: retrying after a drop appends twice today.
- Resuming a stream cannot depend on one isolate holding the task: a log that any isolate can read can serve a client that comes back anywhere.
