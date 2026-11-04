# Specs

Formal specs of the parts of graspy where a bug would lose or leak a child's work. They are [TLA+](https://lamport.azurewebsites.net/tla/tla.html) and run with the TLC model checker. [STATE_MACHINES.md](../STATE_MACHINES.md) lists which part to specify next.

## ChatTurn

`ChatTurn.tla` is the life of a chat turn as a task: the learner's client sends a message, the server works on it, the reply is appended to the conversation and delivered. A client can drop its stream or never come back, and the Worker's isolate can die.

The constants select what is checked:

| Configuration | What it is | Result |
|---|---|---|
| `ChatTurn.asis.cfg` (`Durable = FALSE`) | The chat today: a turn is a task in one isolate's memory, the exchange is appended when the model finishes, and a client that did not hear the reply sends the message again | `AtMostOnce` is violated (a stream drops, the client sends again, and the second execution appends as well); `EventuallyKept` is violated (a message is sent, the isolate dies, and a client that does not return leaves it lost for good); `ShownIsKept` holds |
| `ChatTurn.durable.cfg` | A turn written to an append-only log before work starts, resumed by a watchdog after a crash, joined by its message id when sent again, with an append that is idempotent by message id | All hold: 882 distinct states, no error |
| `ChatTurn.nonidempotent.cfg` | The same, with an append that is not idempotent | `AtMostOnce` is violated: the turn appends, the isolate dies before the log says "done", and the watchdog runs it again |
| `ChatTurn.nojoin.cfg` | The same as durable, but a message the log holds is not joined: a retry starts a second execution | All hold: 1,906 distinct states. Joining saves a model call; it is the idempotent append that keeps the exchange single |

The properties:

- `AtMostOnce`: a message's exchange is in the conversation at most once.
- `ShownIsKept`: a reply the client holds is already in the conversation.
- `EventuallyKept`: a message the server accepted is eventually in the conversation, even if the client never returns.

Not modelled: the order of two different messages, tool calls, cards, compaction, several learners, and message contents. The measurements that fix the model's assumptions (a dropped stream does not stop the turn) are in [CHAT_TURN_LOSS.md](../CHAT_TURN_LOSS.md).

### Running it

TLC needs Java 11 or later and `tla2tools.jar` from the [TLA+ releases](https://github.com/tlaplus/tlaplus/releases):

```bash
cd docs/specs
java -cp /path/to/tla2tools.jar tlc2.TLC -config ChatTurn.durable.cfg ChatTurn.tla
java -cp /path/to/tla2tools.jar tlc2.TLC -config ChatTurn.asis.cfg ChatTurn.tla
```

The second run stops at the first violated property, so to see each one on its own use a configuration with only that invariant or property.

## RecordingRetention

`RecordingRetention.tla` is a child's recording together with the marking of the answer it carries: the audio is uploaded, a worker claims the turn and marks it under a lease and a token, a parent's consent decides whether the audio is kept, and the cron sweep deletes what is due. It follows `apps/server/src/app/voice` (`samples.py`, `worker_evaluation.py`, `exercises.py`, `recording_retention.py`, `parent_recordings.py`). One learner and one recording; time is whole ticks that keep the order lease < waits < a day < retention.

`RecordingRetention.core.cfg` checks what should hold: 1,695,572 distinct states, no error.

- `KeptOnlyUnderConsent`: a recording is kept only if consent was active the moment it was kept.
- `AssessmentOnce` and `CompleteHasItsVerdict`: a verdict is applied once per recording even when a lease takeover runs two workers, and a complete turn has its verdict. This holds because the tutor applies a verdict once per `(turn, lesson, item)` and the server passes the sample id as the turn (`learner_memory.py`, `apps/tutor/src/learner.ts`).
- `UndecidedIsDecided`: nothing stays undecided past a day.
- `ExpiredIsGone`: a kept recording is gone once it is past its expiry.
- `StalledIsSwept`: audio that an upload put a day ago, whose row never named it, does not stay: it is deleted, named by its row, or put again by a new attempt. This holds because the cron sweeps uploads that began a day ago and never finished, with no assumption about the client.

Each of these was checked to be able to fail: with the sweep of unsettled recordings removed, or the sweep of expired ones, or the sweep of stalled uploads, or settling that ignores consent, TLC reports the violation.

The other configurations each break one assumption or ask one policy question, and fail with a short trace:

| Configuration | Question | Result |
|---|---|---|
| `effects` | Does a lease takeover apply a verdict twice if the tutor stops deduplicating? | Yes: claim, a worker sends the verdict, the lease passes, a second claim, its worker sends it too (`AssessmentOnce`) |
| `orphan` | What if an upload dies after the put and the client never returns, and nothing sweeps stalled uploads? | The audio is never swept: no sweep selects a row that is still `awaiting_audio` (`StalledIsSwept`). A client that sends the unfinished upload again closes it too, which is all the code relied on before the sweep of stalled uploads was added |
| `retroactive` | Is a recording kept if consent arrives after it was recorded but before its turn ended? | Yes: upload, consent granted, the turn fails for good, `settle_audio` keeps it (`NoRetroactiveKeep`) |
| `revoke` | Is audio still kept after the parent withdraws consent? | Yes, when the parent does not also ask for the recordings to go; the route documents this (`NoKeptAfterRevoke`) |
| `shorten` | Does a recording kept under 365 days follow the parent's later choice of 30? | No: `expires_at` is set once, when the recording is kept (`ExpiryWithinActiveRetention`) |

The orphan was a gap in the claim at the top of `recording_retention.py`, that no unconsented recording outlives a day; the core configuration now models the sweep of stalled uploads that closes it. The other three are policy: which of them graspy wants is the owner's choice. I did not check whether the R2 bucket has a lifecycle rule that would also remove an orphan.

Not modelled: several learners or recordings (a second sample was not checked), the audio's bytes, transcription, learner removal, and a crash between the object delete and the row update, which the next sweep repeats.

```bash
cd docs/specs
java -cp /path/to/tla2tools.jar tlc2.TLC -config RecordingRetention.core.cfg RecordingRetention.tla
```
