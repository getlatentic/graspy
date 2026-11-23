# Signing a TV in from a phone

A TV has a remote and no keyboard, and Google's sign-in opens a popup a TV browser cannot show. So the TV does not sign in itself: it shows a short code, a link and a QR code, and a phone that is signed in confirms which TV is asking. The TV then receives its own session for one learner of that account.

This is the OAuth 2.0 Device Authorization Grant ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)) with the phone's confirmation made explicit, and it follows the same guidance on codes, polling and phishing. It does not add a second login system: the account is still Google's through Firebase, the phone signs in as it always does, and the TV's session is graspy's own signed session token (`SESSION_SECRET`), shaped like every other one.

## The flow

```
TV                                   API                                  Phone (signed in)
 |  POST /api/tv-sign-in              |                                     |
 |----------------------------------->| device_code (hashed), user_code     |
 |<-----------------------------------| (hashed), label, country, 10 min    |
 |  shows code, link, QR              |                                     |
 |                                    |                                     |
 |  POST /api/tv-sign-in/token  (every `interval` seconds)                  |
 |----------------------------------->| pending / slow_down                 |
 |                                    |                                     |
 |                                    |        opens /link (QR), or types the code
 |                                    |<------------------------------------| POST /lookup
 |                                    |  label, country, time               |
 |                                    |------------------------------------>| shows them, with the code
 |                                    |                          chooses a learner, presses "Sign in"
 |                                    |<------------------------------------| POST /approve
 |  POST /api/tv-sign-in/token        |                                     |
 |----------------------------------->| consumes the request, makes the TV's|
 |<-----------------------------------| session; once                       |
 |  session + refresh credential      |                                     |
 |                                    |                                     |
 |  POST /api/tv-sign-in/session  (before the hour is up)                   |
 |----------------------------------->| renews, while the credential stands |
```

The TV keeps two things: the session token (an hour) and a refresh credential (`localStorage`, `graspy.tv-credential`). A TV has no Google sign-in to renew from, so the credential stands where Firebase's does on other devices. `lib/api/session.ts` renews from it in place of Firebase, and a `401 tv_revoked` signs the TV out and wipes the device, as when Google no longer holds a sign-in.

## Endpoints

All under `/api/tv-sign-in`. Bodies and answers are camelCase JSON.

| Endpoint | Caller | Does |
|---|---|---|
| `POST /` | TV | Starts a request. Returns `deviceCode` (43 characters, 256 bits), `userCode` (8 characters), `verificationUri` (`<web origin>/link`), `verificationUriComplete` (the same with `#code=<userCode>`), `expiresIn` (600) and `interval` (5) |
| `POST /token` | TV, with `deviceCode` | `pending`, `slow_down` (with a longer `interval`), `denied`, `expired`, or `approved` with `token`, `expiresIn`, `refreshToken`, `account` and `learner` |
| `POST /session` | TV, with `refreshToken` | A new session token while the credential stands. `401 tv_revoked` otherwise |
| `POST /sign-out` | TV, with `refreshToken` | Revokes its own credential. Always `204` |
| `POST /lookup` | Phone, `{userCode}` | What the phone is asked to approve: `label`, `country`, `createdAt`, `expiresAt` |
| `POST /approve` | Phone, `{userCode, learnerId}` | Binds the request to the phone's account and that learner. `204` |
| `POST /deny` | Phone, `{userCode}` | The TV's next poll answers `denied`. `204` |
| `GET /devices` | Phone | The account's TVs: `id`, `label`, `learner`, `createdAt`, `lastUsedAt` |
| `DELETE /devices/{id}` | Phone | Revokes one TV. `404` for an id the account does not hold |

Refusals on the phone's calls: `404 code_not_found` (unknown, expired, ended, malformed: one answer for all, so a code cannot be probed), `404 no_such_learner`, `403 consent_required` (the learner has no parent's agreement, as for any learner session), `409 too_many_tvs` (ten per account), `409 already_decided`, `429 rate_limited` with `Retry-After`, `403 account_required` (a device with no account) and `403 tv_session` (a TV's session). `503 tv_sign_in_busy` when too many requests are open.

A TV's session (`tv` claim, the id of its credential) learns as its learner like any learner session. Everything under `/api/account` refuses it with `403 tv_session`, so a TV cannot sign another TV in, add or remove learners, delete the account or start a parent session. The one exception is `GET /api/account/learners`, which shows it only its own learner.

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
| Phone page, `/link` | `features/account/pages/tv-link-page.tsx` |
| QR code | `lib/qr-path.ts` and `components/ui/qr-code.tsx`, made in the page with `qrcode-generator` (MIT, no dependencies) |

The sign-in card offers "Sign in with your phone" first on a television (`data-device="tv"`), and the screen is reachable on any device, for testing.

## Threat model

What an attacker wants: a session for an account they do not own, or a TV signed in to an account without its holder meaning it.

| Threat | What stops it |
|---|---|
| Guessing the device code | 256 random bits, kept only as a SHA-256 hash. A poll for an unknown code reads as `expired` |
| Guessing the short code to approve or deny someone's request | 32 symbols, 8 characters: 40 bits, over at most ten minutes. Each lookup, approval and denial spends the account's and the address's pairing budget (10 a minute) before the code is read, and counts one attempt against the request. The tenth attempt ends it. Only a signed-in account can try at all. The code is kept as an HMAC with the server's secret, so a stolen table gives no codes |
| A short code read off a screen or from a photo | It lives ten minutes, names one open request, and approving it shows the person the TV's label, place and time. Anyone who approves it signs *that TV* in as *their own* account, never the reverse |
| Taking the session after someone else's approval | The request is bound at approval to the account and learner of the phone's session. The device code is the only way to take it. The take is one transaction that makes the session and consumes the request, so a second poll, a replay of the device code and two polls at once get nothing (`expired`) |
| An approval by the wrong account | The phone's account is the session's `acct`; the learner must be held by it (`404 no_such_learner` otherwise) and have a parent's agreement. Another account cannot list or revoke the TV (`404`) |
| Approving an attacker's TV (phishing) | See below |
| A TV approving more TVs, or managing the account | Its session carries `tv`; `/api/account` refuses it |
| Polling too fast, or filling the table | The poll interval is enforced per request: an early poll gets `slow_down` and a longer interval, up to 30 seconds. Starting a request spends the address's pairing budget. At most 5,000 requests are open at once. Rows go an hour after they expire |
| A stolen TV credential | It is shown nowhere, is kept as a hash, and ends after 30 days unused or 90 days. The account lists TVs and revokes any. Signing out on the TV revokes it. Deleting the account removes every TV |
| A revoked TV keeps working | Sessions are signed, not stored. Revoking stops the next renewal, and the last token ends within an hour (`TV_TOKEN_TTL_SECONDS`, against 12 hours for other sessions) |
| Secrets in logs | None of the codes, credentials or tokens is logged; a test reads the log of a whole flow for them |
| Hostile `Origin` redirecting the phone | `verificationUri` uses the caller's `Origin` only if CORS allows it, else a configured origin |

### Phishing: the one that is not solved by code

An attacker can start a request on their own TV, show the code to a victim ("enter this to claim a prize"), and if the victim approves, the attacker's TV learns as the victim's learner. RFC 8628 names this and leaves it to the confirmation step. The mitigations are in the screen, not the protocol:

- The phone never approves from a link alone. It shows the code in large type, the device label, the country and how long ago it asked, and the person must press "Sign in". The QR code only prefills the code.
- The learner is chosen on the phone, and the TV can read nothing of the account but that learner.
- A TV is labelled as a TV and listed in the account's TVs, with the learner and when it was last used, and can be removed at once.
- The TV's session cannot touch the account: no consent, no parent features (recordings, deletion), no other learner.

What stays open: a person who is told to approve, and does, signs that device in. The label comes from the TV's user agent and is a claim, not proof; the country is Cloudflare's `CF-IPCountry`, and no address is kept. A parent who wants more can read the list of TVs on the phone.

## Test with two browsers

The setup of [Development](DEVELOPMENT.md) runs: `npm run dev` and the Firebase Auth emulator. The API keeps requests in memory when it has no D1 (`LocalD1`), so no Worker is needed.

1. In one browser, open `http://localhost:5173/app/sign-in?tv=1` (`?tv=1` makes the page act as a television on a desktop). Choose "Sign in with your phone".
2. In a second browser, or a private window with another origin such as `http://127.0.0.1:5173` (the two share no storage; allow it in `CORS_ORIGINS`), sign in with the emulator's Google account, add a learner, and open the link shown, or `/link` and type the code.
3. Check the label and code, choose the learner and press "Sign in". The first browser signs in within one interval and goes on to onboarding.
4. In the second browser, open `/link` again: the TV is listed. Remove it. The first browser is signed out when its session next renews; to see it at once, clear its `sessionStorage` and reload.

Without a Worker there is no consent store, so the server asks for no parent's agreement and any learner can be chosen. Run the Worker (see Development) to see `403 consent_required` for a learner with none, which the phone shows as a message.

Server tests: `cd apps/server && uv run pytest tests/test_tv_sign_in.py`. Web tests: `cd apps/web && npx vitest run src/lib/account/tv-link-flow.test.ts src/features/account/pages`.
