# Specs

Formal specs of the parts of graspy where a bug would lose or leak a child's work. They are [TLA+](https://lamport.azurewebsites.net/tla/tla.html) and run with the TLC model checker. [STATE_MACHINES.md](../STATE_MACHINES.md) lists which part to specify next.

## ChatTurn

`ChatTurn.tla` is the life of a chat turn as a task: the learner's client sends a message, the server works on it, the reply is appended to the conversation and delivered. A client can drop its stream or never come back, and the Worker's isolate can die.

The constant `Durable` selects what is checked:

| Configuration | What it is | Result |
|---|---|---|
| `ChatTurn.asis.cfg` (`Durable = FALSE`) | The chat today: a turn is a task in one isolate's memory, the exchange is appended when the model finishes, and a client that did not hear the reply sends the message again | `AtMostOnce` is violated (a stream drops after the turn finished, the retry runs a second turn, and the exchange is appended twice); `EventuallyKept` is violated (a message is sent, the isolate dies, and a client that does not return leaves it lost for good); `ShownIsKept` holds |
| `ChatTurn.durable.cfg` (`Durable = TRUE`) | A turn written to an append-only log before work starts, resumed by a watchdog after a crash, and joined by its message id when sent again | All hold: 366 distinct states, no error |

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
