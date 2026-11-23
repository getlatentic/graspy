# Signing a TV in from a phone

A TV has a remote and no keyboard, and Google's sign-in opens a popup a TV browser cannot show. So the TV does not sign in itself: it shows a short code, a link and a QR code, and a parent's phone confirms which TV is asking. The TV receives its own session for one learner of that account.

The person's part is three steps, on the phone:

1. **Scan the QR code** on the TV (or open the link).
2. **Sign in with Google, once, if the phone is not already signed in as the parent.** One button, "Continue with Google". Its sign-in is the account's session *and* the parent's session, from the same Google token, so no second sign-in follows. A phone that already holds a parent's session skips this step.
3. **Type the last four characters of the code shown on the TV.** The page has already looked the code up from the link and shows the TV's label, country and time, and says "Only continue if you are looking at this TV."; the fourth character approves, with no button after it. With more than one learner on the account the page asks which one first, and the boxes wait for the choice: typing never approves for a learner nobody picked.

The TV shows "Linking to <learner>" and who approved. **Where someone is plainly at the TV it counts five seconds and goes on by itself** unless they press Cancel. **Where nothing says anyone is there, it does not go on at all**: it shows Cancel and Continue and waits for a press (see *An unattended TV*).

This is the OAuth 2.0 Device Authorization Grant ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)) with two confirmations added, one on each device, because what it grants is long-lived access to a child's learning record and, through the account, to recordings. It does not add a second login system: the account is still Google's through Firebase, and the TV's session is graspy's own signed session token (`SESSION_SECRET`), shaped like every other one. The server's rules are the ones the earlier, longer flow had; only the screens changed.

## The flow

```
TV                                   API                                  Parent's phone
 |  POST /api/tv-sign-in              |                                     |
 |----------------------------------->| device_code (hashed), user_code     |
 |<-----------------------------------| (hashed), label, country, 10 min    |
 |  shows code, link, QR              |                                     |
 |  POST /token  (every `interval`)   |                                     |
 |----------------------------------->| pending / slow_down                 |
 |                                    |   1. scans the QR: /link#code=...
 |                                    |   2. "Continue with Google", once, if there is no parent session:
 |                                    |      POST /api/session + POST /account/parent-session, one token
 |                                    |<------------------------------------| POST /lookup (on page load)
 |                                    | holds the request for this account  |
 |                                    |------------------------------------>| device, country, time
 |                                    |   3. types the last 4 characters of the code as the TV shows them
 |                                    |<------------------------------------| POST /approve (on the 4th character)
 |  POST /token                       |                                     |
 |----------------------------------->| linking + learner + who approved    |
 |  "Linking to Ada", approver        |                                     |
 |  someone at the TV (input < 2 min, page visible):  5 s countdown, [Cancel] focused,
 |     then, if the timer fired on time: POST /continue
 |  nobody (no input, page hidden, timer late):       [Cancel] focused + [Continue];
 |     POST /continue only when Continue is pressed
 |----------------------------------->| makes the session, consumes the request; once
 |<-----------------------------------| session + refresh credential        |
 |  (Cancel instead: POST /cancel, nothing is made)                         |
 |  POST /session  (before the hour is up)                                  |
 |----------------------------------->| new session + the credential's successor |
```

Lookup and approve are still two guarded server calls; the page runs them back to back on its one screen. A code typed by hand (a link with no code) is asked for first in eight boxes, and the last four are then typed again on the confirm screen. If the phone is signed in but not as the parent, or the parent's few minutes are over, the same one button signs in again.

The TV keeps two things: the session token (an hour) and a refresh credential (`localStorage`, `graspy.tv-credential`). A TV has no Google sign-in to renew from, so the credential stands where Firebase's does on other devices. `lib/api/session.ts` renews from it in place of Firebase and keeps the credential each renewal returns. A `401`, `403` or `404` from a renewal signs the TV out and wipes the device, as when Google no longer holds a sign-in. A `5xx` or no answer is tried again with the same credential, at 2, 5 and 12 seconds (inside the minute the server answers a replaced credential again), reading the credential from storage before each try, so a tab of the TV that renewed meanwhile is not overwritten; if all four fail the credential is kept and the next request tries again.

## Endpoints

All under `/api/tv-sign-in`. Bodies and answers are camelCase JSON. Every answer carries `Cache-Control: no-store`.

| Endpoint | Caller | Does |
|---|---|---|
| `POST /` | TV | Starts a request. Returns `deviceCode` (43 characters, 256 bits), `userCode` (8 characters), `verificationUri` (`<web origin>/link`), `verificationUriComplete` (the same with `#code=<userCode>`), `expiresIn` (600) and `interval` (5) |
| `POST /token` | TV, `deviceCode` | `pending`, `slow_down` (with a longer `interval`), `denied`, `expired`, or `linking` with the `learner` the phone chose and the `approver`: the approving account's address with most of it hidden (`t***@gmail.com`), the phone's label and its country. No session is given |
| `POST /continue` | TV, `deviceCode` | The person at the TV confirmed. `approved` with `token`, `expiresIn`, `refreshToken`, `account` and `learner`, once; `full` when the account already holds ten TVs (the request stays approved: the TV says so, the person removes one on their phone and continues again); `expired` or `denied` otherwise |
| `POST /cancel` | TV, `deviceCode` | Ends a request not yet taken: the TV left the screen asked for a new code, or the person declined. `204` |
| `POST /session` | TV, `refreshToken` | A new session token and the credential's successor, while the credential stands. The learner and the parent's agreement are checked before the credential changes, so a `5xx` leaves it as it was. `401 tv_revoked` otherwise |
| `POST /sign-out` | TV, `refreshToken` | Revokes its own credential. Always `204` |
| `POST /lookup` | Parent, `{userCode}` | What the phone is asked to approve: `label`, `country`, `createdAt`, `expiresAt`. Holds the request for this account for 2 minutes |
| `POST /approve` | Parent, `{userCode, learnerId, confirm}` | Binds the request to the phone's account and that learner, if this account holds it and `confirm` is the last four characters of the code. `204` |
| `POST /deny` | Parent, `{userCode}` | The TV's next poll answers `denied`. `204` |
| `GET /devices` | Parent | The account's TVs: `id`, `label`, `learner`, `createdAt`, `lastUsedAt` |
| `DELETE /devices/{id}` | Parent | Revokes one TV. `404` for an id the account does not hold |

"Parent" is a session made by `POST /api/account/parent-session`: a Google sign-in in the last five minutes, lasting 15. A child's learner session, or an account session that did not just sign in, gets `403 account_required` from every one of those routes, and so does a TV's.

Refusals on the phone's calls: `404 code_not_found` (unknown, expired, ended, malformed, or held by another account when approving or denying: one answer for all), `409 code_in_use` (another account looked the code up first), `403 confirm_mismatch`, `404 no_such_learner`, `403 consent_required` (the learner has no parent's agreement, as for any learner session), `409 too_many_tvs` (ten per account), `409 already_decided`, `429 rate_limited` with `Retry-After`. Starting a request answers `429` when its source (12) or the network around it (40) already holds as many open ones or the network has made 120 an hour, and `503 tv_sign_in_busy` when 5,000 are open in all, 2,500 from one country or 500 from unplaced connections.

A TV's session (`tv` claim, the id of its credential) learns as its learner like any learner session. Everything under `/api/account` refuses it with `403 tv_session`, so a TV cannot sign another TV in, add or remove learners, delete the account or start a parent session. The one exception is `GET /api/account/learners`, which shows it only its own learner. A test walks every route of the OpenAPI document under `/api/account` and `/api/tv-sign-in` and fails on any that serves a TV session.

## Where it lives

| What | Where |
|---|---|
| Codes, hashes, device label | `apps/server/src/app/account/tv_codes.py` |
| Requests (`tv_links`) | `apps/server/src/app/account/tv_links.py` |
| TV credentials (`tv_sessions`) | `apps/server/src/app/account/tv_sessions.py` |
| Routes | `apps/server/src/app/api/tv_sign_in_routes.py` |
| Tables | `apps/server/migrations/0025_tv_sign_in.sql` |
| Purge, by the 15-minute cron | `purge_tv_sign_in`, called from `Default.scheduled` in `worker.py` |
| TV screen, `/app/sign-in/phone` | `features/account/pages/tv-sign-in-page.tsx`, `lib/account/tv-link-flow.ts` |
| Phone page, `/link` | `features/account/pages/tv-link-page.tsx`, `components/tv-confirm.tsx` |
| QR code | `lib/qr-path.ts` and `components/ui/qr-code.tsx`, made in the page with `qrcode-generator` (MIT, no dependencies) |

The sign-in card offers "Sign in with your phone" first on a television (`data-device="tv"`), and the screen is reachable on any device, for testing.

## Threat model

What an attacker wants: a session for an account they do not own, or a TV signed in to an account without its holder meaning it.

| Threat | What stops it, and what does not |
|---|---|
| Guessing the device code | 256 random bits, kept only as a SHA-256 hash. A poll for an unknown code reads as `expired` |
| Guessing the short code | 32 symbols, 8 characters: 40 bits, over at most ten minutes. Only a parent's session can try. Every call that names a code spends the account's and the source's pairing budget (10 a minute), and a wrong guess spends a second, separate pair of budgets, so guessing is limited per account and per source (an IPv6 address counts as its /64). The code is kept as an HMAC with the server's secret, so a stolen table gives no codes. **The cap of ten attempts per request counts only calls of the account holding it that found the request** (lookups, approvals, denials, wrong confirmations). Another account's lookup is turned away with `409` and counts nothing, so it cannot use a request up; a guess that hits nothing has nothing to count against, so wrong guesses are bounded by the rate limits and the size of the space, not by that cap |
| Taking the session after someone else's approval | The request is bound at approval to the account and learner of the parent's session. The device code is the only way to take it. The take makes the session and consumes the request in one transaction, so a second continue, a replay of the device code and continues at once get nothing (`expired`) |
| A second account approving a request the first is deciding | The first account to look a code up holds it for two minutes (`locked_by`, `locked_until`). Another account's lookup gets `409 code_in_use`; its approve and deny find nothing. Approving needs the hold to be this account's and still running |
| A child, or a stolen or stale session, minting a 90-day credential | Lookup, approve, deny, list and remove need the parent's session: a Google sign-in within the last five minutes, as for recordings and consent. A child's learner session and a 12-hour account session get `403` |
| A TV nobody is at, linked to whoever types its code | The TV goes on by itself only with proof someone is there, and otherwise waits for a press. See *An unattended TV* below |
| Approving an attacker's TV (phishing) | The last four characters, typed from the TV's screen, are the confirmation; a victim with only a link fails them. See below |
| A TV approving more TVs, or managing the account | Its session carries `tv`; `/api/account` and the phone's routes refuse it |
| Polling too fast, or filling the table | The poll interval is enforced per request: an early poll gets `slow_down` and a longer interval, up to 30 seconds. Starting a request spends the pairing budgets (20 a minute per key, per Cloudflare location) of the source (an IPv4 address, or an IPv6 /64) and of the network around it (an IPv4 /24, an IPv6 /48). Open (pending, unexpired) requests are capped five ways, in the one statement that inserts: **12 per source, 40 per network, 2,500 per country, 500 for connections Cloudflare cannot place or that come through Tor (`XX`, `T1` and a missing country are one bucket, not exempt), and 5,000 in all**. Requests *made* from a network are also capped at **120 an hour**, whatever became of them, which bounds a loop of starting and cancelling. Only open requests count toward the open caps, so ended ones do not hold the table full, and a TV that leaves its screen cancels its request. Rows go an hour after they expire. **The tradeoff:** a household or school behind one address, or a carrier-grade NAT, shares its 12 open requests, 40 per /24 and 120 an hour, and 20 a minute; a classroom of 30 TVs asked at once behind one address will see some told to wait (`429`) and try again after a minute. The numbers were raised from 8 and 10 a minute for that, and are not higher because the same shares are what an attacker is held to. **What is not done:** there is no CAPTCHA or proof of work on starting a request (the repo has no Turnstile plumbing), so an attacker with many networks in many countries can still fill the 5,000 for ten minutes at a time; the shares make that cost more networks, not impossible, and TVs told `503` try again in a minute |
| A stolen TV credential | It is shown nowhere, is kept as a hash, and ends after 30 days unused or 90 days. **It changes at every renewal, to a successor that follows from it and the server's secret** (`successor_of`), so asking again gives the same answer. The successor's key is derived from `SESSION_SECRET` for this one purpose (an HMAC of a fixed label), so the secret itself is never the key of anything else. **Rotating `SESSION_SECRET` changes every successor:** a renewal in flight while it is rotated may be answered with a successor the TV cannot match, and a TV that presents a credential replaced a minute ago is revoked. That is a hazard of about a minute, and every session of every kind ends at a rotation anyway. A TV whose answer was lost presents the replaced credential again within a minute, at most twice, and is given the same successor; two tabs renewing at once end with one. The credential the first caller received stays current throughout. **Presented a third time, after the minute, or when it is the credential before the replaced one, a replaced credential is a copy and the whole TV is revoked.** What the grace cannot tell apart: a thief holding a copy of the credential that is presented within the minute gets the same successor as the TV (up to two times). Whoever uses that successor first moves the chain on, and the other's next use is a replaced credential: the two cannot both keep going, and the TV, or the thief, is revoked within an hour or on the next renewal. The window is a minute. The account lists TVs and revokes any; signing out on the TV revokes it; deleting the account removes every TV |
| A revoked TV keeps working | Sessions are signed, not stored. Revoking stops the next renewal, and the last token ends within an hour (`TV_TOKEN_TTL_SECONDS`, against 12 hours for other sessions) |
| A TV that took its session and lost the answer | The credential in that answer is unknown to the TV. A credential never renewed a week after its first session ended is revoked by the cron, so it does not linger toward the ten TVs (and a TV linked on Saturday and opened on Monday is not touched). The ten TVs are checked again in the statement that makes the session; an account at the cap leaves the request approved (`full`), it is not used up. A poll that fails for a reason that may pass (the consent store unreadable, `503`) does not end the request |
| Secrets in logs | None of the codes, credentials or tokens is logged; a test reads the log of a whole flow for them. Answers carry `Cache-Control: no-store` |
| An origin that CORS allows only by a wildcard rule | The link a TV shows uses the caller's `Origin` only if it is one of those configured by name, else the first of them |

### Phishing and shoulder-reading: what the confirmations do and do not do

The grant's weakness is that the phone approves *a TV it cannot see*. Two attacks follow.

**A link or QR code sent to a victim.** The attacker starts a request on their own TV and sends the victim the link (`/link#code=...`) or a QR code ("scan to claim a prize"). If the victim approved, the attacker's TV would learn as the victim's learner. What stops it:

- The page needs the parent's session: the victim must sign in with Google, which a link alone does not do.
- **Typing the last four characters is the confirmation.** The page never shows any of the code: not on the confirm screen, not in a box. The fourth character is the approval, and the server checks the four against the code (`403 confirm_mismatch`, one attempt counted, the boxes clear). Those characters are on the TV's screen and nowhere the victim can see, so a victim who followed a link alone cannot give them.
- The confirm screen shows the device label, the country and when it asked, above the boxes.

What it does not stop: an attacker who also **talks to the victim** ("read me what the TV says ... type these four characters, which I will tell you") can pass the check, because the four characters are the attacker's to give. This is social engineering, not a flaw in the check, and the only defence is the screen's own words above the boxes, "Only continue if you are looking at this TV.", with the label and country. The server cannot tell a person reading a screen from one reading a message.

**A classroom projector, a shared TV or a shoulder.** Someone who can see a TV showing its code can read all of it, the last four characters included, and type it into their *own* phone. They would link that TV to *their own* account, never to the viewer's, and cannot reach anyone else's learner: approving needs their own parent's session and one of their own learners. **The typed characters do not stop this, because they are on the screen they are looking at**; the plain residual risk is that a person in the room can link the projector to their own account and, if someone has been using its remote in the last two minutes and does not press Cancel in five seconds, it will show their learner's lessons until it is signed out. A projector nobody has touched for two minutes does not go on by itself. What limits it: the first lookup holds the request for two minutes, so the person actually at the TV, who looks it up first, is not raced by a second account; the TV says "Linking to <name>", who approved (the account's masked address, the phone and its country) and counts five seconds with Cancel focused, so a press of OK or Back on the remote says no; a TV linked wrongly can be signed out on the TV itself, which revokes its credential; and the TV gets nothing of the other account. What stays open: a person who looks the code up before the owner can hold it for two minutes, and the owner's request is then refused with "another account" until it lapses; they can repeat that while the code lives (ten minutes). The owner asks for a new code. And five seconds is short for someone who is not looking at the TV: nobody has to be.

### An unattended TV

The five seconds are a veto, and a veto means nothing if nobody can use it. A QR code shared on a screen in a class call, a projector left on the sign-in screen, a lobby TV someone photographs: each shows a live code with no one at the TV. If the TV went on by itself five seconds after the approval, whoever typed the four characters (which are on the same screen) would be linked to it with nobody there to cancel. So **presence is proven by the TV, not assumed**. It goes on by itself only if all three hold, and otherwise does not call `/continue` at all:

1. **Input.** The TV saw input *from a person* in the two minutes before the approval arrived, measured on the monotonic clock (`performance.now()`), so changing the wall clock cannot keep presence alive or make it, and a reading earlier than the input counts as none. What counts (`lib/account/tv-presence.ts`): a key press, a pointer press, a touch, a wheel turn, and pointer movement of at least 8 px from where it was last counted. What does not: any event a script made (`isTrusted` false); a pointer that has not moved, however many `pointermove` events the browser sends under it (the screen re-renders each second); and anything else (key release, hover, focus, scroll). The press that starts the flow counts, by the handler of *that* press: the click on "Sign in with your phone" (an Enter on the focused link is a click) and on "New code". **The screen opening does not count**: a boot, a redirect, a session failure, or a restart by a timer lands on the screen with no press, and so waits for Continue. A TV left idle for two minutes fails this.
2. **Visible.** `document.visibilityState` is `visible` when the approval arrives and again when the timer fires.
3. **On time.** When the timer fires, both the wall clock and a monotonic clock have moved by about five seconds, not more than seven. A page that was frozen, or a TV that slept, and resumed fires its timer late; nobody saw the countdown, so it does not go on.

When any fails the screen shows "Linking to <learner>" and who approved with **Cancel (focused) and Continue**, no countdown, and waits for the person at the TV; the request expires after ten minutes as before. The server is not involved in the decision: the session is released only when the TV calls `/continue` with its device code, which an unattended TV does not.

**The accepted residual risk:** an attacker who can see the code *and* the TV is being used with its remote within two minutes of the approval (a classroom TV the teacher has just been pressing buttons on, a family TV mid-evening) gets the five-second auto path. What stands between them and a link is that the four typed characters had to be read from the screen, the TV says "Linking to <learner>" and who approved (a masked address, the phone, the country), and the person has five seconds with Cancel focused. That is the mitigation, and it is not proof of intent. The input proof is also not proof the person is *looking*: a key press from a bystander counts.

**What the five seconds are for.** Approving is not signing in: the session is released only when the TV calls `/continue` with its device code, which it does by itself five seconds after the phone approved. The window is the person at the TV's veto. A learner's name alone is chosen by whoever approves, so the screen also says who approved: the account's address with most of it hidden, the phone's label and its country. The mask is `t***@gmail.com`, and `***@gmail.com` when the part before the `@` is one or two characters, so a short address is never shown whole. **It is a hint, not proof: a lookalike mask is possible** (many addresses share `t***@gmail.com`, and an attacker can pick one that resembles the owner's), and the label and country are the approving phone's own claims. So **Cancel is always the focused button**, whatever the account. The TV remembers nothing about the accounts it has linked. Asking for the session has its own timeout of fifteen seconds, so a call that hangs ends the screen in a defined state: the request is cancelled (the credential, if one was made, was never delivered, and is not known). Whenever the session is asked for and the answer is an error, the request is cancelled as well as the credential signed out; signing out is tried once more if it fails, with the credential alone (`/sign-out` needs no session). After the account was full, the TV does not offer a countdown again: asking again shows Continue, disabled while it waits. A Cancel pressed after the session has begun to be given (the timer fired, the request is on its way) is not a no-op and not a `/cancel`: the screen waits for the answer, and the credential that was made is **signed out** (`/sign-out`, by its own credential), so no session is left that no device holds. Leaving the screen (Back) while it is being given does the same, and the request for the session is never aborted for that, so that it is known whether one was made. Asking twice, by the timer and a press together, asks once. The veto is not a defence against an attacker's own TV, which presses nothing, and an account already at ten TVs sees "This account has 10 TVs. Remove one on your phone, then continue." with a Continue to try again (the request stays approved).

What stays true whatever the screens say: a parent who approves a TV they cannot see signs it in. The label comes from the TV's user agent and is a claim, not proof; the country is Cloudflare's `CF-IPCountry`, and no address is kept.

### Not changed in this work

- `apps/server/src/app/config/cors.py`: `CORS_ORIGINS` allows one wildcard label (for preview deployments such as `https://*.graspy.pages.dev`) by a regular expression, so any origin matching it may call the API with a session. The link a TV shows no longer trusts it (above); loosening or tightening the rule itself is outside this change.
- The API-wide budget (`API_LIMITER`) still counts an IPv6 address as one source, not its /64. Only the pairing budgets use the /64.

## Test with two browsers

The setup of [Development](DEVELOPMENT.md) runs: `npm run dev` and the Firebase Auth emulator. The API keeps requests in memory when it has no D1 (`LocalD1`), so no Worker is needed.

1. In one browser, open `http://localhost:5173/app/sign-in?tv=1` (`?tv=1` makes the page act as a television on a desktop). Choose "Sign in with your phone".
2. In a second browser, or a private window with another origin such as `http://127.0.0.1:5173` (the two share no storage; allow it in `CORS_ORIGINS`), open the link the first one shows (`/link#code=...`). Press "Continue with Google" and choose or make an emulator account: that one sign-in is the parent's session. (A learner must exist for the account: add one at `/app/learners` first.)
3. Type the last four characters shown on the first browser. The first browser shows "Linking to <name>" with a five-second countdown and goes on by itself, then to onboarding. Press Cancel inside the five seconds to see nothing made.
4. In the second browser, open `/link` again and sign in: the TV is listed. Remove it. The first browser is signed out when its session next renews; to see it at once, clear its `sessionStorage` and reload.

Without a Worker there is no consent store, so the server asks for no parent's agreement and any learner can be chosen. Run the Worker (see Development) to see `403 consent_required` for a learner with none, which the phone shows as a message.

Server tests: `cd apps/server && uv run pytest tests/test_tv_sign_in.py`. They run on SQLite in one process (`LocalD1`): the tests that start or approve "at once" with `asyncio.gather` show that each guard is one statement that holds on its own, but a single process runs a statement to its end before the next starts, so they do not prove D1's atomicity or its behaviour across isolates. That rests on each rule being one SQL statement, which D1 runs as a transaction. Web tests: `cd apps/web && npx vitest run src/lib/account/tv-link-flow.test.ts src/features/account/pages`.

## The migration

`0025_tv_sign_in.sql` was edited in place across the review of the pull request. `main` has no 0025 and nothing from the branch has been deployed, so staging applies it fresh. **Any database that already applied an earlier version of it (a local `wrangler d1 migrations apply --local` state from this branch, or any copy of it) must be reset**: it lacks columns the code uses, and a migration that has run is not run again. A test builds the schema from 0025 alone and compiles every statement of `tv_links.py` and `tv_sessions.py` against it, so a column the code needs and the file lacks fails in CI.
