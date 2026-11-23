# Parent PIN

What only a parent may do is hidden from a child who has the same phone or television: a learner's kept voice recordings, the TVs signed in to the account, and agreeing for a learner. Until now the parent proved who they were by signing in with Google again. The parent now types a PIN, as in a streaming service's profile lock or a phone's screen time: set once, typed when a parent action needs it, and good for 15 minutes.

This is the owner's decision (2026-11-23), made for all of those actions, recording-retention consent included. It is a weaker proof than a fresh Google sign-in, and the record of each consent says which was used (below), so the decision can be reviewed.

Account deletion is the one action the PIN does not stand for: it needs a Google sign-in made just now (a parent's session with `gate: google`), and the web app asks for it with its own step. Deleting the account deletes graspy's Firebase user, which only the Google account's holder should be able to ask for.

## What the parent sees

One component, `ParentGate` (`apps/web/src/features/account/components/parent-gate.tsx`), sits in front of everything that needs the parent. With the parent's session in force it shows what is behind it; without, it asks.

| The account has | The parent sees |
|---|---|
| a PIN | a pad as long as the PIN (`length` from the status), and the PIN is sent when its last digit is typed. A wrong PIN shakes the dots and clears them. "Forgot PIN?" |
| no PIN | "Set a parent PIN": a PIN of 4 to 8 digits and Next, then the same again, then one Google sign-in to save it |
| a lock | "Locked. Try again in 15 min." (an hour; 24 h), and "Forgot PIN?" |
| a PIN and a forgotten one | "Forgot PIN?" leads to the same three steps as setting one, and the Google sign-in is what proves them: the new PIN replaces the old, and ends the lock |

`ParentGate` is what the recordings page (including agreeing to keep them), the TV page of a phone (`/link`) and agreeing for a learner (the notice's "I agree", in the learner picker, the manage page and the gate in front of a learner's pages) use. Tapping "I agree" opens the gate in place of the notice; the agreement is sent when the parent's session is in force, so a parent who typed the PIN a minute ago is not asked again. Nothing else in the app asks for the parent.

The pad (`components/ui/pin-pad.tsx`) is ten real buttons and a delete key, which a finger, a pointer, the arrow keys and OK of a remote (spatial navigation), and the number keys of a keyboard or a remote all use. The digits are kept in the component's state and never put in the page: the dots count them, and there is no field, so there is nothing for a password manager, a paste or an autofill to find. It writes nothing to storage, the address or the log (tests check each).

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

- **The pepper is never stored**, so a copy of the table cannot even test a guess: there are only 10,000 four-digit PINs, and without the pepper none of them can be tried. It is derived from `SESSION_SECRET` for this one purpose, as the TV credential's successor key is, so the secret itself is the key of nothing else.
- **The salt is the row's own**, so two accounts with the same PIN, or one account setting it twice, have different hashes.
- **The comparison is constant time** (`hmac.compare_digest`).
- **100,000 iterations is the most the Workers runtime allows PBKDF2** in WebCrypto. Pyodide's `hashlib` has no `pbkdf2_hmac` at all (checked), so the Worker calls WebCrypto, which runs natively; Python elsewhere uses `hashlib` for the same sum, and a test compares the two on the same input. Measured: 15 ms in CPython with OpenSSL, 15.7 ms in Node's WebCrypto, 16 ms on average (18.6 ms for the first call) through the same Python code under Pyodide on Node. Not measured in `workerd` itself, because deploying a Worker was outside this change.
- **`SESSION_SECRET` rotation ends every parent PIN**, since the pepper is derived from it: the account's next try is "wrong", and the parent uses Forgot PIN. That is the same blast radius as rotating the secret has for every session; deployments should know it.

### The lockout

Five wrong PINs lock the account for 15 minutes; the next five, for an hour; every five after that, for 24 hours. A right PIN, or a new PIN set after a Google sign-in, starts again from the first. While locked, even the right PIN is refused (`429 pin_locked`, with `lockedUntil` and `Retry-After`), so the lock is no oracle. A wrong PIN answers `403 pin_wrong` with `attemptsLeft`.

- **It is the account's, in D1.** It does not live in a session or on a device, so a new learner session, a second phone or a cleared browser does not reset it.
- **Each attempt is charged before it is compared**, by one guarded `UPDATE ... RETURNING`: it adds one to the count, starts the lock when the count reaches five, and answers only while the account is not locked. The hash is computed only for a request the statement answered, so at most five are computed per lock however many arrive at once, and a request cut off after the charge has still been counted. A right PIN clears the count and the lock. This is `parent_pins.CHARGE_SQL`.
- **A test sends 40 wrong attempts at once** with `asyncio.gather`: four answer `pin_wrong`, 36 `pin_locked`, and five hashes are computed. That shows the charge is one statement that holds on its own. It does not prove D1's atomicity: in-process SQLite finishes a statement before the next starts. That rests on D1 running a single statement as one transaction, as the TV sign-in's guards do.
- **Two budgets sit in front of it** (`PIN_LIMITER`, a new binding, 10 a minute per key): one per account and one per source address (an IPv6 address as its /64). A request over a budget is `429 rate_limited` and charges nothing. Like the other budgets they count per Cloudflare location, so they slow a flood and the lockout is the control.
- **The time to try every PIN**: five tries at once, five after 15 minutes, five more after an hour and 15 minutes, then five a day. For the 10,000 four-digit PINs, less the 24 runs and repeats that are refused, that is about 2,000 days to try them all, and half that on average. A longer PIN costs a guesser more: a six-digit one is a hundred times that.

### The parent's session

`POST .../verify` and `PUT .../parent-pin` answer with the session the Google route always made (`par` claim, 15 minutes, the account and no learner), and a `gate` claim, `pin` or `google`. A parent's session made before the claim existed reads as `google`. `ParentUid`, the dependency every parent route uses, still refuses a child's session, an account session and a TV's, as before; it now also reads the PIN's row.

**Setting a PIN ends the parent sessions made before it** (changing it, or resetting it after a Google sign-in, the same). Sessions are signed, not stored, so each parent route compares the session's start with the row's `set_at`: one read of one row by primary key per parent call. A session made in the same second as the reset is kept (the session the reset itself answers with is one). TV sessions are not touched: a TV was linked by a parent, can be removed from the phone's list, and renews from its own credential, none of which a PIN is part of. The TV list is still one parent action away, and a parent who fears a child had the PIN can remove the TVs there.

### The consent record

A consent is a row in `consents`; it now carries `gate`, `pin` or `google`, taken from the parent's session the request was made under, or `google` when a Google sign-in is sent with the request (Android sends one, and the routes still accept it). Every consent kept before is `google` (the column's default). Nothing in the app reads the column back: it is for whoever has to decide how much a parent's agreement is worth.

**A PIN is weaker evidence of a parent's agreement than a Google sign-in.** A sign-in just made shows the holder of the account typed their Google credentials, or approved on a device that holds them. A PIN shows someone who knows four digits was at the phone: it could be a child who watched the parent type it, or a grandparent the parent told. Whether either is enough for parental consent under the rules that apply to a child's data, under 13 in particular, is an open question for the owner and counsel (the voice recordings' consent is the case that raised it). The decision for PIN-based consent was made knowing this; the `gate` column is how it can be revisited: a consent given through `pin` can be asked for again with Google, one by one or all together, without a migration.

## Threat model

What an attacker wants: a child's recordings, a TV signed in as their learner, or an agreement given that a parent did not give.

| Threat | What stops it, and what does not |
|---|---|
| A child on the parent's phone guesses the PIN | The lockout above, shared by every session of the account; the answers while locked reveal nothing; the obvious PINs (runs and repeats: 0000, 1234, 4321) cannot be chosen. A child who has watched the PIN typed knows it: nothing in a PIN prevents that, and the 15-minute session is what limits a PIN that was seen once |
| A child sets or resets the PIN to lock the parent out or to own it | Setting needs a Google sign-in just made as this account (`require_fresh_sign_in`, which also needs Google rather than a password), and changing needs the old PIN or the same. The sign-in is Firebase's `reauthenticateWithPopup`, which opens Google's window. **What it does not stop**: a phone whose Google session is open in the browser, where the window may need only a tap on the account. A child there can do the same today with the Google re-sign-in this replaces |
| A stolen copy of the table | No PIN is stored. The hash needs the pepper, which is not in the database, to test a guess at all; the salt is per account |
| A stolen `SESSION_SECRET` | It makes the pepper, so with it and the table every PIN can be tried offline at 15 ms each: ten thousand PINs in minutes. The same secret signs every session, a parent's too, so it is already the key to everything else |
| Guessing without the lockout (many accounts at once, many addresses) | The lockout is per account, so many addresses do not get more guesses at one account. Many accounts need many Google accounts and a session for each |
| Two requests at once spending one attempt | The charge is one statement before the compare; see above |
| Learning whether a PIN is set, or its length | `GET` answers `{hasPin, length}` to any session of the account, a child's included, because the pad needs them. The pad of someone who has none is the "Set" pad, which is no secret on the phone itself. `verify` with no PIN answers `409 pin_not_set` for the same reason |
| A session of the parent kept after a reset | Ended by the reset (above), not by the clock |
| A child reaching a parent route with a learner's session, a device's or a TV's | `ParentUid` and `Uid` as before; a TV's session reaches no route here (walked by a test) |
| Deleting the account with the PIN | Needs `gate: google`: `403 google_sign_in_required` for the PIN's session, `403 account_required` for the rest. **Before this change the route needed only the account's session, so a child's session could delete it; that is fixed here, and Android's delete call (`apps/mobile`) must make the parent's session with a Google sign-in first, or it is refused** |
| The PIN in a log, an address, storage or a page | Never written; a rejected body is not echoed; the pad has no field. Tests read the log, the address, `localStorage` and the page |
| Someone watching the PIN typed | Not stopped. The dots show only how many digits there are |
| A parent who loses the PIN | Forgot PIN: a Google sign-in just made, and a new one. The lock ends with it |

## Not done

- Removing the PIN, so that a parent action asks for Google again. There is no route: a PIN can only be replaced.
- Reusing a Google sign-in made a minute ago to save the first PIN. A new parent who has just signed in for the first time signs in with Google a second time when saving the PIN. Reusing the first sign-in would be safe by the server's own rule (the sign-in is fresh for five minutes), and is a change for the owner to ask for.
- Raising the iteration count, or moving to a stronger function: `kdf` and `iterations` are in the row for it. The Workers runtime's cap is what limits it now.
- Translations: the new words are English in every language file, as the app offers English only (2026-09-30).
