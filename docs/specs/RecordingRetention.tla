------------------------- MODULE RecordingRetention -------------------------
(***************************************************************************)
(* A child's recording and the marking of the answer it carries: the audio *)
(* is uploaded, a worker claims the turn and marks it, a parent's consent  *)
(* decides whether the audio is kept, and the cron sweep deletes what is   *)
(* due. One learner, so one consent.                                       *)
(*                                                                         *)
(* It follows apps/server/src/app/voice:                                   *)
(*   samples.py            the object is put, then the row is updated      *)
(*   worker_evaluation.py  claim, token-guarded complete and fail, settle  *)
(*   exercises.py          lease, waits between attempts, MAX_TURN_ATTEMPTS*)
(*   recording_retention.py  settle_audio and sweep_audio                  *)
(*   parent_recordings.py and account_voice_routes.py  the parent's side   *)
(*                                                                         *)
(* Time is whole ticks, not minutes: Lease < the waits < UndecidedLimit <  *)
(* the retention periods, as 3 min < 2 and 30 min < 1 day < 30 days.       *)
(* The cron is fair: a sweep that stays possible happens. What the spec    *)
(* checks is that the sweep can always reach what is due.                  *)
(*                                                                         *)
(* Not modelled: several learners, the audio's bytes, transcription, the   *)
(* contents of a verdict, learner removal, and a crash between the object  *)
(* delete and the row update (the next sweep repeats both).                *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Samples,         \* the learner's recordings
    MaxTime,         \* ticks in a run
    Lease,           \* PROCESSING_LEASE_MS
    Wait1, Wait2,    \* RETRY_AFTER_MS[1], RETRY_AFTER_MS[2]
    UndecidedLimit,  \* UNDECIDED_KEPT_MS: a day
    RetShort, RetLong,  \* the retention a parent can choose, shortest and longest
    MaxAttempts,     \* MAX_TURN_ATTEMPTS
    TutorDedupes,    \* the tutor applies a verdict once per sample, whoever sends it
    ClientRetriesUpload, \* a client whose upload did not finish sends it again
    SweepsStalledUploads \* the cron deletes what an upload put when it began a day ago and never finished

ASSUME /\ Lease \in Nat \ {0}
       /\ Wait1 \in Nat /\ Wait2 \in Nat
       /\ UndecidedLimit \in Nat \ {0}
       /\ RetShort \in Nat \ {0} /\ RetLong \in Nat /\ RetShort < RetLong
       /\ MaxAttempts \in Nat \ {0}
       /\ TutorDedupes \in BOOLEAN /\ ClientRetriesUpload \in BOOLEAN
       /\ SweepsStalledUploads \in BOOLEAN

VARIABLES
    \* The audio and its sample row (samples.py, recording_retention.py)
    obj,             \* obj[s]: the audio object is in R2
    keyed,           \* keyed[s]: the row names the object (audio_key is set)
    uploadedAt,      \* uploadedAt[s]: when the row was updated
    putAt,           \* putAt[s]: when the object was last put
    expires,         \* expires[s]: 0 is NULL: undecided; else when it must go
    deleted,         \* deleted[s]: audio_deleted_at is set
    \* The turn that marks the answer (worker_evaluation.py, exercises.py)
    tState,          \* "none", "failed", "processing" or "complete"
    tAttempts,
    tUpdated,
    tToken,          \* the claim token of the latest claim
    live,            \* live[s]: tokens of workers still running
    taught,          \* taught[s]: tokens that already sent the verdict to the tutor
    applied,         \* applied[s]: times the tutor applied a verdict for s
    nextToken,
    \* The parent's consent (account/consents.py)
    cActive, cDays,
    \* Ghosts, for the properties only
    keptAt,          \* keptAt[s]: when the recording was kept
    keptUnder,       \* keptUnder[s]: consent was active when it was kept
    consentAtUpload, \* consentAtUpload[s]: consent was active when it was uploaded
    now

vars == <<obj, keyed, uploadedAt, putAt, expires, deleted,
          tState, tAttempts, tUpdated, tToken, live, taught, applied, nextToken,
          cActive, cDays, keptAt, keptUnder, consentAtUpload, now>>

Tokens == 1..(MaxAttempts * Cardinality(Samples))

TypeOK ==
    /\ obj \in [Samples -> BOOLEAN]
    /\ keyed \in [Samples -> BOOLEAN]
    /\ uploadedAt \in [Samples -> 0..MaxTime]
    /\ putAt \in [Samples -> 0..MaxTime]
    /\ expires \in [Samples -> 0..(MaxTime + RetLong)]
    /\ deleted \in [Samples -> BOOLEAN]
    /\ tState \in [Samples -> {"none", "failed", "processing", "complete"}]
    /\ tAttempts \in [Samples -> 0..MaxAttempts]
    /\ tUpdated \in [Samples -> 0..MaxTime]
    /\ tToken \in [Samples -> 0..Cardinality(Tokens)]
    /\ live \in [Samples -> SUBSET Tokens]
    /\ taught \in [Samples -> SUBSET Tokens]
    /\ applied \in [Samples -> Nat]
    /\ nextToken \in 1..(Cardinality(Tokens) + 1)
    /\ cActive \in BOOLEAN /\ cDays \in {RetShort, RetLong}
    /\ keptAt \in [Samples -> 0..MaxTime]
    /\ keptUnder \in [Samples -> BOOLEAN]
    /\ consentAtUpload \in [Samples -> BOOLEAN]
    /\ now \in 0..MaxTime

Init ==
    /\ obj = [s \in Samples |-> FALSE]
    /\ keyed = [s \in Samples |-> FALSE]
    /\ uploadedAt = [s \in Samples |-> 0]
    /\ putAt = [s \in Samples |-> 0]
    /\ expires = [s \in Samples |-> 0]
    /\ deleted = [s \in Samples |-> FALSE]
    /\ tState = [s \in Samples |-> "none"]
    /\ tAttempts = [s \in Samples |-> 0]
    /\ tUpdated = [s \in Samples |-> 0]
    /\ tToken = [s \in Samples |-> 0]
    /\ live = [s \in Samples |-> {}]
    /\ taught = [s \in Samples |-> {}]
    /\ applied = [s \in Samples |-> 0]
    /\ nextToken = 1
    /\ cActive = FALSE
    /\ cDays = RetShort
    /\ keptAt = [s \in Samples |-> 0]
    /\ keptUnder = [s \in Samples |-> FALSE]
    /\ consentAtUpload = [s \in Samples |-> FALSE]
    /\ now = 0

----------------------------------------------------------------------------
(* Definitions that read the SQL of recording_retention.py and exercises.py *)

Present(s) == keyed[s] /\ ~deleted[s]            \* PRESENT
Undecided(s) == Present(s) /\ expires[s] = 0
Kept(s) == Present(s) /\ expires[s] # 0
Ended(s) ==                                      \* ENDED_SQL's turn condition
    \/ tState[s] = "complete"
    \/ tState[s] = "failed" /\ tAttempts[s] >= MaxAttempts

WaitFor(attempts) ==
    IF attempts >= 2 THEN Wait2 ELSE IF attempts = 1 THEN Wait1 ELSE 0

(* claimable() and the guards of _claim_turn *)
Claimable(s) ==
    /\ keyed[s]
    /\ ~deleted[s]                  \* a deleted recording answers audio_not_ready
    /\ tAttempts[s] < MaxAttempts
    /\ now >= tUpdated[s] + WaitFor(tAttempts[s])
    /\ \/ tState[s] \in {"none", "failed"}
       \/ tState[s] = "processing" /\ now > tUpdated[s] + Lease

DueForSweep(s) ==
    \/ Undecided(s) /\ now - uploadedAt[s] >= UndecidedLimit
    \/ Kept(s) /\ now >= expires[s]

Orphan(s) == obj[s] /\ ~keyed[s]                 \* put, and the row never updated

(* The audio is deleted: the object first, then the row. *)
DeleteAudio(s) ==
    /\ obj' = [obj EXCEPT ![s] = FALSE]
    /\ deleted' = [deleted EXCEPT ![s] = TRUE]

----------------------------------------------------------------------------
(* The upload: samples.py puts the object, then updates the row. *)

PutAudio(s) ==
    /\ ~keyed[s]
    /\ ~deleted[s]
    /\ obj' = [obj EXCEPT ![s] = TRUE]
    /\ putAt' = [putAt EXCEPT ![s] = now]
    /\ UNCHANGED <<keyed, uploadedAt, expires, deleted, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

RecordUpload(s) ==
    /\ obj[s]
    /\ ~keyed[s]
    /\ keyed' = [keyed EXCEPT ![s] = TRUE]
    /\ uploadedAt' = [uploadedAt EXCEPT ![s] = now]
    /\ consentAtUpload' = [consentAtUpload EXCEPT ![s] = cActive]
    /\ UNCHANGED <<obj, putAt, expires, deleted, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, now>>

(* The marking turn: _claim_turn, the worker, and its token-guarded writes. *)

Claim(s) ==
    /\ Claimable(s)
    /\ nextToken <= Cardinality(Tokens)
    /\ tState' = [tState EXCEPT ![s] = "processing"]
    /\ tAttempts' = [tAttempts EXCEPT ![s] = @ + 1]
    /\ tUpdated' = [tUpdated EXCEPT ![s] = now]
    /\ tToken' = [tToken EXCEPT ![s] = nextToken]
    /\ live' = [live EXCEPT ![s] = @ \cup {nextToken}]
    /\ nextToken' = nextToken + 1
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, taught, applied,
                   cActive, cDays, keptAt, keptUnder, consentAtUpload, now>>

(* The worker sends the transcript to the tutor, which applies the verdict. *)
Teach(s, t) ==
    /\ t \in live[s]
    /\ t \notin taught[s]
    /\ obj[s]                              \* the recording is there to be heard
    /\ taught' = [taught EXCEPT ![s] = @ \cup {t}]
    /\ applied' = [applied EXCEPT ![s] = IF TutorDedupes THEN 1 ELSE @ + 1]
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tState,
                   tAttempts, tUpdated, tToken, live, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

(* COMPLETE_TURN_SQL: only the latest claim's token completes the row. *)
Complete(s, t) ==
    /\ t \in live[s]
    /\ t \in taught[s]
    /\ tState[s] = "processing"
    /\ tToken[s] = t
    /\ tState' = [tState EXCEPT ![s] = "complete"]
    /\ tUpdated' = [tUpdated EXCEPT ![s] = now]
    /\ live' = [live EXCEPT ![s] = @ \ {t}]
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tAttempts, tToken,
                   taught, applied, nextToken, cActive, cDays, keptAt, keptUnder,
                   consentAtUpload, now>>

(* _fail_turn: a provider failure, a missing recording, or audio with no speech, *)
(* which spends every attempt.                                                  *)
Fail(s, t, noSpeech) ==
    /\ t \in live[s]
    /\ tState[s] = "processing"
    /\ tToken[s] = t
    /\ tState' = [tState EXCEPT ![s] = "failed"]
    /\ tAttempts' = [tAttempts EXCEPT ![s] = IF noSpeech THEN MaxAttempts ELSE @]
    /\ tUpdated' = [tUpdated EXCEPT ![s] = now]
    /\ live' = [live EXCEPT ![s] = @ \ {t}]
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tToken, taught,
                   applied, nextToken, cActive, cDays, keptAt, keptUnder,
                   consentAtUpload, now>>

(* A worker that no longer holds the claim ends without writing. *)
StaleWorkerEnds(s, t) ==
    /\ t \in live[s]
    /\ \/ tToken[s] # t
       \/ tState[s] # "processing"
    /\ live' = [live EXCEPT ![s] = @ \ {t}]
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tState, tAttempts,
                   tUpdated, tToken, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

(* The worker dies; the row stays processing until the lease passes. *)
WorkerDies(s, t) ==
    /\ t \in live[s]
    /\ live' = [live EXCEPT ![s] = @ \ {t}]
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tState, tAttempts,
                   tUpdated, tToken, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

----------------------------------------------------------------------------
(* settle_audio: once the turn has ended, the consent decides. It runs when  *)
(* the turn ends, on a later poll, and in the cron's ENDED sweep.            *)

Settle(s) ==
    /\ Undecided(s)
    /\ Ended(s)
    /\ IF cActive
         THEN /\ expires' = [expires EXCEPT ![s] = now + cDays]
              /\ keptAt' = [keptAt EXCEPT ![s] = now]
              /\ keptUnder' = [keptUnder EXCEPT ![s] = cActive]
              /\ UNCHANGED <<obj, deleted>>
         ELSE /\ DeleteAudio(s)
              /\ UNCHANGED <<expires, keptAt, keptUnder>>
    /\ UNCHANGED <<keyed, uploadedAt, putAt, tState, tAttempts, tUpdated, tToken,
                   live, taught, applied, nextToken, cActive, cDays,
                   consentAtUpload, now>>

SweepExpired(s) ==
    /\ Kept(s)
    /\ now >= expires[s]
    /\ DeleteAudio(s)
    /\ UNCHANGED <<keyed, uploadedAt, putAt, expires, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

(* An upload began a day ago and never finished: the object has no row that *)
(* names it, so the sweep deletes the keys the upload may have put.          *)
SweepStalled(s) ==
    /\ SweepsStalledUploads
    /\ Orphan(s)
    /\ now - putAt[s] >= UndecidedLimit
    /\ obj' = [obj EXCEPT ![s] = FALSE]
    /\ UNCHANGED <<keyed, uploadedAt, putAt, expires, deleted, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

SweepUnsettled(s) ==
    /\ Undecided(s)
    /\ now - uploadedAt[s] >= UndecidedLimit
    /\ DeleteAudio(s)
    /\ UNCHANGED <<keyed, uploadedAt, putAt, expires, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

(* The parent. *)

Grant(days) ==
    /\ days \in {RetShort, RetLong}
    /\ cActive' = TRUE
    /\ cDays' = days
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tState, tAttempts,
                   tUpdated, tToken, live, taught, applied, nextToken, keptAt,
                   keptUnder, consentAtUpload, now>>

(* DELETE /consent: recordings already kept stay until they expire unless    *)
(* the parent also asks for them to go (deleteRecordings).                   *)
Revoke(alsoDelete) ==
    /\ cActive
    /\ cActive' = FALSE
    /\ IF alsoDelete
         THEN /\ obj' = [s \in Samples |-> IF Kept(s) THEN FALSE ELSE obj[s]]
              /\ deleted' = [s \in Samples |-> IF Kept(s) THEN TRUE ELSE deleted[s]]
         ELSE UNCHANGED <<obj, deleted>>
    /\ UNCHANGED <<keyed, uploadedAt, putAt, expires, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cDays, keptAt,
                   keptUnder, consentAtUpload, now>>

ParentDeletes(s) ==
    /\ Kept(s)
    /\ DeleteAudio(s)
    /\ UNCHANGED <<keyed, uploadedAt, putAt, expires, tState, tAttempts, tUpdated,
                   tToken, live, taught, applied, nextToken, cActive, cDays,
                   keptAt, keptUnder, consentAtUpload, now>>

(* Time passes. *)
Tick ==
    /\ now < MaxTime
    /\ now' = now + 1
    /\ UNCHANGED <<obj, keyed, uploadedAt, putAt, expires, deleted, tState, tAttempts,
                   tUpdated, tToken, live, taught, applied, nextToken, cActive,
                   cDays, keptAt, keptUnder, consentAtUpload>>

Done == now = MaxTime /\ UNCHANGED vars

Next ==
    \/ Tick
    \/ Done
    \/ \E days \in {RetShort, RetLong}: Grant(days)
    \/ \E alsoDelete \in BOOLEAN: Revoke(alsoDelete)
    \/ \E s \in Samples:
          \/ PutAudio(s)
          \/ RecordUpload(s)
          \/ Claim(s)
          \/ Settle(s)
          \/ SweepExpired(s)
          \/ SweepUnsettled(s)
          \/ SweepStalled(s)
          \/ ParentDeletes(s)
          \/ \E t \in Tokens:
                \/ Teach(s, t)
                \/ Complete(s, t)
                \/ \E noSpeech \in BOOLEAN: Fail(s, t, noSpeech)
                \/ StaleWorkerEnds(s, t)
                \/ WorkerDies(s, t)

(* The cron sweeps and settles. A client whose upload did not finish sends *)
(* it again, when ClientRetriesUpload; the cron deletes what a stalled      *)
(* upload put, when SweepsStalledUploads.                                   *)
Fairness ==
    \A s \in Samples:
        /\ WF_vars(Settle(s))
        /\ WF_vars(SweepExpired(s))
        /\ WF_vars(SweepUnsettled(s))
        /\ SweepsStalledUploads => WF_vars(SweepStalled(s))
        /\ ClientRetriesUpload => WF_vars(RecordUpload(s))

Spec == Init /\ [][Next]_vars /\ Fairness

----------------------------------------------------------------------------
(* Safety *)

(* The tutor applies a verdict once per sample, however many workers a lease *)
(* takeover has run: it holds only while the tutor dedupes by sample.        *)
AssessmentOnce == \A s \in Samples: applied[s] <= 1

(* A recording is kept only if consent was active the moment it was kept. *)
KeptOnlyUnderConsent == \A s \in Samples: Kept(s) => keptUnder[s]

(* Liveness *)

(* No recording stays undecided past a day: sweep_audio settles the ones   *)
(* whose turn ended (kept if the parent agreed, deleted if not) and then    *)
(* deletes the rest.                                                         *)
UndecidedIsDecided ==
    \A s \in Samples:
        (Undecided(s) /\ now - uploadedAt[s] >= UndecidedLimit) ~> ~Undecided(s)

(* A kept recording is gone once it is past its expiry. *)
ExpiredIsGone ==
    \A s \in Samples: (Kept(s) /\ now >= expires[s]) ~> ~Present(s)

(* Audio that an upload put a day ago, whose row never named it, does not  *)
(* stay: it is deleted, named by its row, or put again by a new attempt     *)
(* that starts its own day. With no retry and no sweep of stalled uploads,  *)
(* an upload that dies between the put and the update leaves audio that     *)
(* nothing finds.                                                            *)
StalledIsSwept ==
    \A s \in Samples:
        (Orphan(s) /\ now - putAt[s] >= UndecidedLimit)
            ~> ~(Orphan(s) /\ now - putAt[s] >= UndecidedLimit)

(* The turn's row is only written by the latest claim: a complete turn has *)
(* the token of a worker that sent the verdict.                             *)
CompleteHasItsVerdict ==
    \A s \in Samples: tState[s] = "complete" => applied[s] >= 1

(* Policy questions: each holds or fails depending on what graspy intends. *)

(* A recording kept only if consent was active when it was recorded, not *)
(* merely when its turn ended.                                            *)
NoRetroactiveKeep == \A s \in Samples: Kept(s) => consentAtUpload[s]

(* No audio is kept while the parent's consent is withdrawn. *)
NoKeptAfterRevoke == \A s \in Samples: Kept(s) => cActive

(* A kept recording never outlives the retention the parent now chose. *)
ExpiryWithinActiveRetention ==
    \A s \in Samples: Kept(s) /\ cActive => expires[s] <= keptAt[s] + cDays

=============================================================================
