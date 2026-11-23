# Parent PIN

What only a parent may do is hidden from a child who has the same phone or television: a learner's kept voice recordings, the TVs signed in to the account, and agreeing for a learner. Until now the parent proved who they were by signing in with Google again. The parent now types a PIN, as in a streaming service's profile lock or a phone's screen time: set once, typed when a parent action needs it, and good for 15 minutes.

This is the owner's decision (2026-11-23), made for all of those actions, recording-retention consent included. It is a weaker proof than a fresh Google sign-in, and the record of each consent says which was used (below), so the decision can be reviewed.

Account deletion is the one action the PIN does not stand for: it needs a Google sign-in made just now (a parent's session with `gate: google`), and the web app asks for it with its own step. Deleting the account deletes graspy's Firebase user, which only the Google account's holder should be able to ask for.

## What the parent sees

One component, `ParentGate` (`apps/web/src/features/account/components/parent-gate.tsx`), sits in front of everything that needs the parent. With the parent's session in force it shows what is behind it; without, it asks.

| The account has | The parent sees |
|---|---|
| a PIN | a pad as long as the PIN (`length` from the status), and the PIN is sent when its last digit is typed. A wrong PIN shakes the dots and clears them. "Forgot PIN?" |
| no PIN | "Set a parent PIN": a PIN of 6 to 8 digits ("Don't use your phone or card PIN") and Next, then the same again, then one Google sign-in to save it |
| a PIN turned off | "The PIN is turned off. Use Forgot PIN." (after 15 wrong tries since the last Google proof) |
| a lock | "Locked. Try again in 15 min." (an hour; 24 h), and "Forgot PIN?" |
| a PIN and a forgotten one | "Forgot PIN?" leads to the same three steps as setting one, and the Google sign-in is what proves them: the new PIN replaces the old, and ends the lock |

`ParentGate` is what the recordings page (including agreeing to keep them), the TV page of a phone (`/link`) and agreeing for a learner (the notice's "I agree", in the learner picker, the manage page and the gate in front of a learner's pages) use. Tapping "I agree" opens the gate in place of the notice; the agreement is sent when the parent's session is in force, so a parent who typed the PIN a minute ago is not asked again. Nothing else in the app asks for the parent.

`/link` keeps the three-step flow ([TV sign-in](TV_SIGN_IN.md)): a Google sign-in on `/link` makes the account and the parent's session from one token, so a signed-out parent is never asked for the PIN there; the PIN pad appears only for a phone signed in without a parent's session.

The pad (`components/ui/pin-pad.tsx`) is ten real buttons and a delete key, in a **random order, new for each go**, so someone watching over a shoulder sees where a finger went and not which digit (the number keys of a keyboard or a remote are not affected; `shuffle={false}` gives the usual layout), which a finger, a pointer, the arrow keys and OK of a remote (spatial navigation), and the number keys of a keyboard or a remote all use. The digits are kept in the component's state and never put in the page: the dots count them, and there is no field, so there is nothing for a password manager, a paste or an autofill to find. It writes nothing to storage, the address or the log (tests check each).

## The server

| | |
|---|---|
| `GET /api/account/parent-pin` | `{hasPin, length, lockedUntil}`: what the pad needs to draw itself. A session that is the account's, a child's included, may ask; so the length of a PIN, and that there is one, is not secret from it |
| `POST /api/account/parent-pin/verify` | `{pin}`: the parent's session, `gate: pin`, for the right PIN |
| `PUT /api/account/parent-pin` | `{pin, firebaseIdToken}` sets or replaces it after a Google sign-in just now; `{pin, currentPin}` changes it with the old one. Answers with the parent's session |
| `POST /api/account/parent-session` | The existing route: a Google sign-in just now makes the parent's session, `gate: google`. The web app uses it for deleting the account only |

All of them are the account's routes: a session with `tv` (a TV) is refused (`403 tv_session`), and a test walks every route of the OpenAPI document under `/api/account` with a TV's session. The tests are `apps/server/tests/test_parent_pin.py`.

### How the PIN is kept

`parent_pins` (`apps/server/migrations/0026_parent_pin.sql`) holds one row per account: a random salt, the hash, the key-derivation function and its iteration count (so they can be raised later), the PIN's length, the account's masked address for the TV to show, when it was set, and the lockout's counters. The PIN itself is never kept or logged; a rejected body is not echoed (the app's validation handler leaves the input out).

```
pepper  = HMAC-SHA256(SESSION_SECRET, "graspy parent pin pepper v1")
keyed   = HMAC-SHA256(pepper, "pin:" + account + ":" + PIN)
hash    = PBKDF2-HMAC-SHA256(keyed, salt, 100,000 iterations, 32 bytes)
```

- **The pepper is never stored**, so a copy of the table cannot even test a guess: there are only a million six-digit PINs, and without the pepper none of them can be tried. It is derived from `SESSION_SECRET` for this one purpose, as the TV credential's successor key is, so the secret itself is the key of nothing else.
- **The salt is the row's own**, so two accounts with the same PIN, or one account setting it twice, have different hashes.
- **The comparison is constant time** (`hmac.compare_digest`).
- **100,000 iterations is the most the Workers runtime allows PBKDF2** in WebCrypto. Pyodide's `hashlib` has no `pbkdf2_hmac` at all (checked), so the Worker calls WebCrypto, which runs natively; Python elsewhere uses `hashlib` for the same sum, and a test compares the two on the same input. Measured: 15 ms in CPython with OpenSSL, 15.7 ms in Node's WebCrypto, 16 ms on average (18.6 ms for the first call) through the same Python code under Pyodide on Node. Not measured in `workerd` itself, because deploying a Worker was outside this change.
- **`SESSION_SECRET` rotation ends every parent PIN**, since the pepper is derived from it: the account's next try is "wrong", and the parent uses Forgot PIN. That is the same blast radius as rotating the secret has for every session; deployments should know it.

### The guess budget

A PIN is a small number, so what stops a child on a shared phone is how few guesses they get. These are the numbers, for a child who does not know the PIN:

| Wrong PINs since the last Google proof | Guesses so far | Then |
|---|---|---|
| 5 wrong in a row | 5 | locked 15 minutes |
| 5 more in a row | 10 | locked 1 hour |
| 5 more | **15** | **the PIN is turned off** (`403 pin_disabled`, the same error shape) until Forgot PIN, a Google sign-in made for it |

- **Exactly 15 guesses per Google proof, per term.** Two counters do two jobs. `failed_count` is the lock: wrong PINs since the last lock or success, five of which start the next lock on the ladder (15 minutes, an hour, a day; the ladder steps down one rung for each 7 clean days since the last lock, and a success does not reset it). `proof_wrong` is the budget: **every wrong PIN adds one, a parent's success takes none back** (it gives back only the charge of its own attempt), and only a Google proof clears it (`parent_pins.SET_SQL`). At 15 the PIN is turned off, whatever the locks were and however many times the parent typed the right PIN between. A change with the old PIN does not clear it either. Before this, a success reset the ladder and the count, which gave a child about 465 guesses a term (4.7% of 10,000 four-digit PINs), about 1,365 if the parent unlocked daily, and then a first fix still let each right PIN refund up to four. Tests interleave right PINs between wrong ones and show the PIN still turns off at 15.
- **Six digits at least**, so 15 guesses are 0.0015% of a uniform PIN, against 0.15% of four digits. People do not choose uniformly, so the PINs they choose first are not offered (below): a child who guesses a birthday or 123456 gets nothing.
- **Not offered**: a repeat or a run (000000, 123456, 654321, wrapping 890123), one block said over or each digit doubled (121212, 123123, 112233), a pattern on a phone's keypad (2580, 147852, 159753), anything that parses as a date (DDMMYY, MMDDYY, YYMMDD, month and year, DDMMYYYY, MMDDYYYY, YYYYMMDD; years 1900 to 2035), and a list of about 150 common ones. The server decides; the app checks the same rules to say so before the Google sign-in. Both read `tests/fixtures/weak-pins.json` in their tests, so the lists cannot drift. About 11% of the six-digit PINs are refused.
- **It is the account's, in D1.** It does not live in a session or on a device, so a new learner session, a second phone or a cleared browser does not reset it. A Google proof (Forgot PIN) clears the lock and the disabling and starts the 15 guesses again.
- **Each attempt is charged before it is compared**, by one guarded `UPDATE ... RETURNING` that answers only while the account is not locked or disabled and has fewer than five uncleared wrong PINs. The hash is computed only for a request the statement answered, so at most five are computed per lock however many arrive at once, and a request cut off after the charge has still been counted. A wrong PIN then starts the lock with a second guarded statement that takes effect once for the five (`parent_pins.LOCK_SQL`); a lock whose writer was cut off is written by the next attempt. A right PIN clears the count, nothing else.
- **A test sends 40 wrong attempts at once** with `asyncio.gather`: five hashes are computed, one lock is written, and the rest are told it is locked. That shows the charge is one statement that holds on its own. It does not prove D1's atomicity: in-process SQLite finishes a statement before the next starts. That rests on D1 running a single statement as one transaction, as the TV sign-in's guards do.
- **The budgets in front of it** (`PIN_LIMITER`, a binding, 10 a minute per key) are one per **session** and one per **source** address (an IPv6 address as its /64), not per account: a child spamming PINs from their session spends their own, and does not hold the parent at `rate_limited`. A request over a budget is `429 rate_limited` and charges nothing. Forgot PIN (a Google sign-in) spends none. Like the other budgets they count per Cloudflare location, so they slow a flood and the lockout is the control.
- **What the parent is told** (below).

### What a row must be

- `kdf`, `kdf_version` and `iterations` are in the row, and the server hashes only with a function, version and count it accepts (100,000 iterations, the Workers WebCrypto ceiling): a row outside that is treated as no PIN, never hashed with, so a tampered count cannot weaken a hash or cost CPU. A new function is a new version, not a table rebuild.
- `pepper_id` names the key the hash was made with. After `SESSION_SECRET` is rotated the account answers "no PIN" (`GET` says `hasPin: false`, and `verify` says `409 pin_not_set` for every try until a new one is set) and the parent sets a new one with Google, instead of burning attempts on a hash that can never match.
- **Changing the PIN with the old one is written only against the hash that was typed** (`UPDATE ... WHERE hash = ?old`): two changes at once make one and refuse one (`409 pin_changed`).

### The parent's session

`POST .../verify` and `PUT .../parent-pin` answer with the session the Google route always made (`par` claim, 15 minutes, the account and no learner), and a `gate` claim, `pin` or `google`. A parent's session made before the claim existed reads as `google`. `ParentUid` (`api/parent_access.py`), the dependency every parent route uses, refuses a child's session, an account session and a TV's, and reads the PIN's row. **It now guards renaming a learner, removing one and adding one** (`PATCH` and `DELETE /api/account/learners/{id}`, `POST /api/account/learners`): before, any account session could, so a child could erase a sibling's records, recordings and consent trail, or fill the account's eight places. A learner is added with the parent's agreement (`consent`, with the parent's session or a fresh Google token in the body, as before), so first-learner creation at onboarding still works: the web asks for the PIN (or sets one) at that agreement. Adding without `consent` needs the parent's session. Listing and choosing a learner stay the account's, a child's included (a TV reads its own learner).

**Setting a PIN ends the parent sessions made before it** (changing it, or resetting it after a Google sign-in, the same). Sessions are signed, not stored, so each parent route compares the session's start with the row's `set_at`: one read of one row by primary key per parent call. A session made in the same second as the reset is kept (the session the reset itself answers with is one). **TVs record the gate they were linked under** (`tv_sessions.gate`, from the approving parent's session). A reset with Google signs out the TVs linked with the PIN, since the PIN may have been a child's, and tells the parent how many (`tvsSignedOut`, and in the notice); TVs linked with Google stay. Changing the PIN with the old one signs out none.

### The consent record

A consent is a row in `consents`; it now carries `gate`, `pin` or `google`, taken from the parent's session the request was made under, or `google` when a Google sign-in is sent with the request (Android sends one, and the routes still accept it), and `proved_at`, when that parent's session began (or the Google sign-in was made).

**An agreement needs a parent's session under two minutes old** (`403 parent_fresh_required` otherwise). A parent's session lasts 15 minutes for the TV list and the recordings, but a child handed an unlocked phone inside that time must not be able to tap "I agree": the app lets go of a session older than 100 seconds when "I agree" is tapped, so `ParentGate` asks for the PIN again at the consent step, and does the same when the server says it was stale. Recordings retention and service consent are both held to this. Every consent kept before is `google` (the column's default). Nothing in the app reads the column back: it is for whoever has to decide how much a parent's agreement is worth.

**A PIN is weaker evidence of a parent's agreement than a Google sign-in.** A sign-in just made shows the holder of the account typed their Google credentials, or approved on a device that holds them. A PIN shows someone who knows four digits was at the phone: it could be a child who watched the parent type it, or a grandparent the parent told. Whether either is enough for parental consent under the rules that apply to a child's data, under 13 in particular, is an open question for the owner and counsel (the voice recordings' consent is the case that raised it). The decision for PIN-based consent was made knowing this; the `gate` column is how it can be revisited: a consent given through `pin` can be asked for again with Google, one by one or all together, without a migration.

### What the parent is told

`pin_events` records a lock, the PIN turning off, a set and a reset, and what a PIN let through (a TV linked, a consent given); two groups are kept apart, each with its newest 200 per account, so a burst of one cannot push out the other: the PIN's own events (`locked`, `disabled`, `wrong`, `set`, `reset`) and what a PIN let through (`tv_linked`, `consent`). A `wrong` event is written at the third wrong PIN in a row, so guessing that stops short of a lock still shows. The You page shows a quiet banner of what the parent has not seen, up to ten of each group ("Someone entered the wrong PIN 5 times on 20 November", "Someone entered a wrong PIN 3 times", "The PIN was turned off after 15 wrong tries", "The PIN was reset on ... 2 TVs linked with the old PIN were signed out", "A TV was linked with the PIN on ...", "An agreement was given with the PIN on ..."). Any session of the account may read it, a child's too, which deters more than it harms; **only a parent's session made from Google a moment ago clears it** (`POST .../activity/acknowledge {upTo}`, "Got it" asks for the Google sign-in), and **only up to the newest event the page showed**: what happened after the page was drawn stays unread. So a child cannot hide their own guesses. There is no email: the notice is what a parent sees next time they use the account.

### Google proofs

What proves a parent by Google is checked in four ways.

- **Fresh**: the ID token's `auth_time` is within five minutes, and the sign-in was with Google.
- **Single-use** (`account/google_proofs.py`, table `google_proofs`): the newest `auth_time` an account has proved by is kept, and a proof is accepted only if its `auth_time` is **later**, by one guarded statement. A token read off a device (it sits in IndexedDB) proves once, and two requests with the same token at once are not both taken (`401 sign_in_reused`). It applies to every place a token proves: `PUT /parent-pin` (set, reset), `POST /parent-session`, a consent or a learner added with a token in the body, and the deleting of the account (through its Google parent session).
- **Bound to the session it is sent under**: made under an account session, the token's `auth_time` must be later than the session's `iat`, **or be the sign-in the session was minted from** (the session keeps it as `at`). That exception is what lets the signed-out `/link` flow make the account's session and the parent's from one sign-in: `POST /api/session` does not spend the token (it proves nothing); the parent session route takes it, once.
- **Held to the real credential time**: a Google parent session keeps its sign-in's `auth_time` (`at`), and deleting the account needs it within five minutes of **that**, not of when the session was made. A consent's `proved_at` is that time for a Google proof, and the session's `iat` for the PIN. Parent sessions carry `iat`, and their start is taken from it.

The web app's `signInWithGoogle` asks for the account to be chosen (`prompt=select_account`), and what makes a parent (`reauthenticateWithGoogle`, `signInAsParent`, resetting the PIN, deleting the account, clearing the notice) asks for the credentials again whatever Google's window remembers (`prompt=login`, `max_age=0`). The emulator ignores those parameters, so this is checked by a test of the call, not by running Google.

**Residual, and what these do not stop.** The server cannot see how a sign-in was made: `prompt=login` is the web app's request. A child who can drive Firebase's own sign-in themselves (the browser's console on the phone) can make a second sign-in of their own, one tap on an account Google remembers, and use it: single-use and "later than the session" make a token read off the device worth one use, no more, but they do not make Google ask for a password. A passkey or screen-lock re-authentication on an unlocked phone still satisfies `prompt=login`: whoever holds the unlocked phone passes it. The proof is as strong as Google's re-authentication on that phone, and no stronger.

### Gates, from strongest to weakest

A consent's `gate` says what the parent passed (`consents.gate`, with `proved_at`):

1. `google`: a parent's session made from a Google sign-in (a fresh one, single-use, made for it).
2. `pin`: a parent's session made from the PIN, under two minutes old. Weaker than 1: see below.
3. `google-token`: **a bare Google token in the request and no parent's session**, which is what Android sends today. It shows that a Google sign-in was made in the last five minutes, not that a parent made it for this action; ranked weakest. A learner may be added on a bare token only for an account's first learner, or an account with no PIN (`403 account_required` otherwise: the parent's session is needed, which the PIN makes). Android should make a parent session instead (a follow-up, in `docs/DEPLOYING.md` and the planning issue).

## Threat model

What an attacker wants: a child's recordings, a TV signed in as their learner, or an agreement given that a parent did not give.

| Threat | What stops it, and what does not |
|---|---|
| A child on the parent's phone guesses the PIN | 15 guesses per Google proof, six digits at least, the PINs people choose first not offered, the ladder kept across successes (above); the answers while locked or disabled reveal nothing; the notice shows the attempt. A child who has watched the PIN typed knows it: the shuffled pad makes that harder over a shoulder, not impossible (the dots and the finger's path are visible, and a camera sees the layout too), and nothing in a PIN prevents it. The session's 15 minutes and, for an agreement, its two minutes are what limit a PIN that was seen once |
| A child sets or resets the PIN to lock the parent out or to own it | Setting needs a Google sign-in just made as this account (`require_fresh_sign_in`, which also needs Google rather than a password), and changing needs the old PIN or the same. The sign-in is Firebase's `reauthenticateWithPopup`, which opens Google's window. The credentials are asked for again (`prompt=login`), so a Google window that remembers the account is not enough; **what it does not stop** is a child who knows the parent's Google password |
| A stolen copy of the table | No PIN is stored. The hash needs the pepper, which is not in the database, to test a guess at all; the salt is per account |
| A stolen `SESSION_SECRET` | It makes the pepper, so with it and the table every PIN can be tried offline at 15 ms each: ten thousand PINs in minutes. The same secret signs every session, a parent's too, so it is already the key to everything else |
| Guessing without the lockout (many accounts at once, many addresses) | The lockout is per account, so many addresses do not get more guesses at one account. Many accounts need many Google accounts and a session for each |
| Two requests at once spending one attempt | The charge is one statement before the compare; see above |
| Learning whether a PIN is set, or its length | `GET` answers `{hasPin, length, lockedUntil, disabled}` to any session of the account, a child's included, because the pad needs them. The pad of someone who has none is the "Set" pad, which is no secret on the phone itself. `verify` with no PIN answers `409 pin_not_set` for the same reason |
| A session of the parent kept after a reset | Ended by the reset (above), not by the clock |
| A child reads the Google token off the device and sends it to set or reset the PIN | Single-use and bound to the session (above): worth one use, only if it is later than the last proof and than the session, or the sign-in the session was made from. Residual in "Google proofs" |
| A parent's successes refund a child's guesses | They do not: `proof_wrong` (above) |
| A burst of linked TVs evicts the record of the wrong PINs | Two groups, each with its own 200 |
| A bare Google token is taken for as much as a parent's session | `gate = google-token`, ranked weakest; first learner or PIN-less accounts only |
| Anyone behind one address spends a parent's per-source budget | The budget is per (account, source); the lockout is the control |
| An approved TV request the PIN gave, not yet taken, makes a session after a reset | Voided by a reset with Google |
| A child handed an unlocked phone taps "I agree" | An agreement needs a parent's session under two minutes old; the PIN is asked for again at the consent step |
| A child renames, removes or adds learners | `ParentUid` on all three; a child's session gets `403 account_required` (and a TV's `403 tv_session`, walked by a test) |
| A TV linked by a child who knew the PIN stays after the PIN is reset | TVs linked with the PIN are signed out by a reset with Google |
| A hash made under a rotated secret burns the parent's attempts | `pepper_id`: it reads as no PIN |
| A child reaching a parent route with a learner's session, a device's or a TV's | `ParentUid` and `Uid` as before; a TV's session reaches no route here (walked by a test) |
| Deleting the account with the PIN | Needs `gate: google` and a Google sign-in (its own `auth_time`) under five minutes old: `403 google_sign_in_required` for the PIN's session, `403 account_required` for the rest. **Before this change the route needed only the account's session, so a child's session could delete it; that is fixed here, and Android's delete call (`apps/mobile`) must make the parent's session with a Google sign-in first, or it is refused** |
| The PIN in a log, an address, storage or a page | Never written; a rejected body is not echoed; the pad has no field. Tests read the log, the address, `localStorage` and the page |
| Someone watching the PIN typed | Not stopped. The dots show only how many digits there are |
| A parent who loses the PIN | Forgot PIN: a Google sign-in just made, and a new one. The lock ends with it |

## Not done

- Email or push to the parent: the notice shows on their next visit only.
- Removing the PIN, so that a parent action asks for Google again. There is no route: a PIN can only be replaced.
- Reusing a Google sign-in made a minute ago to save the first PIN. A new parent who has just signed in for the first time signs in with Google a second time when saving the PIN. Reusing the first sign-in would be safe by the server's own rule (the sign-in is fresh for five minutes), and is a change for the owner to ask for.
- Raising the iteration count, or moving to a stronger function: `kdf` and `iterations` are in the row for it. The Workers runtime's cap is what limits it now.
- Translations: the new words are English in every language file, as the app offers English only (2026-09-30).
