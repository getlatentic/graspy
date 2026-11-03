------------------------------ MODULE ChatTurn ------------------------------
(***************************************************************************)
(* The life of a chat turn as a task: the client sends a message, the     *)
(* server works on it, the reply is appended to the conversation and      *)
(* delivered. A client can drop its stream or leave, and the Worker's     *)
(* isolate can die.                                                       *)
(*                                                                        *)
(* Durable = FALSE is the chat today (apps/server/src/app/agent): a turn  *)
(* is a task in one isolate's memory, the exchange is appended when the   *)
(* model finishes, and a client that did not hear the reply sends the     *)
(* message again. Durable = TRUE is the design where a turn is written to *)
(* an append-only log before work starts, a watchdog resumes a turn the   *)
(* isolate dropped, and an exchange is appended once per message id. A    *)
(* message the log already holds can also be joined and not run again;    *)
(* that saves a model call but is not what keeps the exchange single.     *)
(*                                                                        *)
(* Not modelled: the order of two different messages, tool calls, cards,  *)
(* compaction, several learners, and the contents of any message.         *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Messages,      \* the learner's messages, for example {m1, m2}
    Durable,       \* TRUE: logged and resumed; FALSE: today
    JoinsById,     \* Durable: a message the log holds is joined, not started again
    AppendIsIdempotent,  \* Durable: appending an exchange is once per message id
    MaxCrashes,    \* isolate deaths in one run
    MaxAttempts    \* sends of one message: the first and the retries

ASSUME /\ Durable \in BOOLEAN
       /\ JoinsById \in BOOLEAN
       /\ AppendIsIdempotent \in BOOLEAN
       /\ MaxCrashes \in Nat
       /\ MaxAttempts \in Nat \ {0}

VARIABLES
    attempts,      \* attempts[m]: how many times the client sent m
    running,       \* running[m]: executions of m alive in the isolate, before their append
    pending,       \* pending[m]: executions of m that appended and have not yet finished
    reply,         \* reply[m]: an execution of m finished, so a reply exists
    connected,     \* connected[m]: the client's stream for m is open
    shown,         \* shown[m]: the client received the reply
    kept,          \* kept[m]: times m's exchange was appended to the conversation
    logged,        \* logged[m]: the durable log's record of m
    up,            \* the isolate is alive
    crashes        \* isolate deaths so far

vars == <<attempts, running, pending, reply, connected, shown, kept, logged, up, crashes>>

LogStates == {"none", "started", "done"}

TypeOK ==
    /\ attempts \in [Messages -> 0..MaxAttempts]
    /\ running \in [Messages -> Nat]
    /\ pending \in [Messages -> Nat]
    /\ reply \in [Messages -> BOOLEAN]
    /\ connected \in [Messages -> BOOLEAN]
    /\ shown \in [Messages -> BOOLEAN]
    /\ kept \in [Messages -> Nat]
    /\ logged \in [Messages -> LogStates]
    /\ up \in BOOLEAN
    /\ crashes \in 0..MaxCrashes

Init ==
    /\ attempts = [m \in Messages |-> 0]
    /\ running = [m \in Messages |-> 0]
    /\ pending = [m \in Messages |-> 0]
    /\ reply = [m \in Messages |-> FALSE]
    /\ connected = [m \in Messages |-> FALSE]
    /\ shown = [m \in Messages |-> FALSE]
    /\ kept = [m \in Messages |-> 0]
    /\ logged = [m \in Messages |-> "none"]
    /\ up = TRUE
    /\ crashes = 0

(* A message the log already holds is joined, not started again. *)
Joins(m) == Durable /\ JoinsById /\ logged[m] # "none"

Send(m) ==
    /\ up
    /\ ~shown[m]
    /\ ~connected[m]
    /\ attempts[m] < MaxAttempts
    /\ attempts' = [attempts EXCEPT ![m] = @ + 1]
    /\ connected' = [connected EXCEPT ![m] = TRUE]
    /\ running' = [running EXCEPT ![m] = IF Joins(m) THEN @ ELSE @ + 1]
    /\ logged' = [logged EXCEPT ![m] = IF Durable /\ @ = "none" THEN "started" ELSE @]
    /\ UNCHANGED <<pending, reply, shown, kept, up, crashes>>

(* The model finished an execution of m and its exchange is appended to the *)
(* conversation. Once per message id when appending is idempotent, and once  *)
(* per execution today.                                                       *)
Append(m) ==
    /\ up
    /\ running[m] > 0
    /\ running' = [running EXCEPT ![m] = @ - 1]
    /\ pending' = [pending EXCEPT ![m] = @ + 1]
    /\ kept' = [kept EXCEPT ![m] =
                   IF Durable /\ AppendIsIdempotent THEN (IF @ = 0 THEN 1 ELSE @) ELSE @ + 1]
    /\ UNCHANGED <<attempts, reply, connected, shown, logged, up, crashes>>

(* The reply exists and the log records the turn as done. *)
Finish(m) ==
    /\ up
    /\ pending[m] > 0
    /\ pending' = [pending EXCEPT ![m] = @ - 1]
    /\ logged' = [logged EXCEPT ![m] = IF Durable THEN "done" ELSE @]
    /\ reply' = [reply EXCEPT ![m] = TRUE]
    /\ UNCHANGED <<attempts, running, connected, shown, kept, up, crashes>>

Deliver(m) ==
    /\ up
    /\ connected[m]
    /\ reply[m]
    /\ shown' = [shown EXCEPT ![m] = TRUE]
    /\ connected' = [connected EXCEPT ![m] = FALSE]
    /\ UNCHANGED <<attempts, running, pending, reply, kept, logged, up, crashes>>

(* The client's stream ends. Measured on the staging Worker and under        *)
(* uvicorn: the turn keeps running and its exchange is kept.                 *)
Drop(m) ==
    /\ connected[m]
    /\ ~shown[m]
    /\ connected' = [connected EXCEPT ![m] = FALSE]
    /\ UNCHANGED <<attempts, running, pending, reply, shown, kept, logged, up, crashes>>

(* The isolate dies: every execution and every stream with it. The log and *)
(* the conversation are in D1 and Durable Objects and stay.                *)
Crash ==
    /\ up
    /\ crashes < MaxCrashes
    /\ up' = FALSE
    /\ crashes' = crashes + 1
    /\ running' = [m \in Messages |-> 0]
    /\ pending' = [m \in Messages |-> 0]
    /\ connected' = [m \in Messages |-> FALSE]
    /\ UNCHANGED <<attempts, reply, shown, kept, logged>>

Restart ==
    /\ ~up
    /\ up' = TRUE
    /\ UNCHANGED <<attempts, running, pending, reply, connected, shown, kept, logged, crashes>>

(* The watchdog starts a turn the log says began and nothing is running. *)
Watchdog(m) ==
    /\ Durable
    /\ up
    /\ logged[m] = "started"
    /\ running[m] = 0
    /\ pending[m] = 0
    /\ running' = [running EXCEPT ![m] = 1]
    /\ UNCHANGED <<attempts, pending, reply, connected, shown, kept, logged, up, crashes>>

Next ==
    \/ Crash
    \/ Restart
    \/ \E m \in Messages:
          \/ Send(m)
          \/ Append(m)
          \/ Finish(m)
          \/ Deliver(m)
          \/ Drop(m)
          \/ Watchdog(m)

(* A client may vanish, so Send has no fairness. The isolate comes back, *)
(* work in it finishes, replies reach a connected client, and the         *)
(* watchdog runs.                                                         *)
Fairness ==
    /\ WF_vars(Restart)
    /\ \A m \in Messages:
          /\ WF_vars(Append(m))
          /\ WF_vars(Finish(m))
          /\ WF_vars(Deliver(m))
          /\ WF_vars(Watchdog(m))

Spec == Init /\ [][Next]_vars /\ Fairness

----------------------------------------------------------------------------
(* Safety *)

(* A message's exchange is in the conversation at most once. With a durable *)
(* log it needs an idempotent append: a crash after the append and before    *)
(* the log says "done" makes the watchdog run the turn again.                *)
AtMostOnce == \A m \in Messages: kept[m] <= 1

(* The client never holds a reply the conversation does not. *)
ShownIsKept == \A m \in Messages: shown[m] => kept[m] >= 1

(* Liveness *)

(* A message the server accepted is eventually in the conversation, even *)
(* if the client never comes back.                                       *)
EventuallyKept == \A m \in Messages: (attempts[m] >= 1) ~> (kept[m] >= 1)

=============================================================================
