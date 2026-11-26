# Security

Signing in is optional, and goes through Google by Firebase, so graspy keeps no passwords. The tutor chat under `/app/learn/ask` is for a signed-in account's learner; the public `/try` chat is for anyone: it is text only, keeps what a visitor says about themselves on their device, and is rate limited. The assets are the model budget, the service itself and the learner's record. Everything a learner types reaches a model, and the model can repeat it, so all model output is untrusted.

## Controls (OWASP Top 10, 2021)

| # | Risk | Control | Test |
|---|---|---|---|
| A01, A07 | Access control, authentication | Signed session token on generation, the learner's record, `/a2a` and `/mcp`; expiry; signature bound to the payload. A sign-in checked with Identity Toolkit | `test_session.py`, `test_accounts.py` |
| A02 | Cryptography | HMAC-SHA256 with a fixed algorithm; TLS at Cloudflare | `test_session.py` |
| A03 | Injection | The calculator evaluates an AST allowlist with size and depth bounds; no `eval` | `test_sandbox.py` |
| A05 | Misconfiguration | CORS allowlist, docs off in production, security headers, CSP by hash | `test_cors.py`, `test_security_headers.py`, `csp.test.ts` |
| A06 | Vulnerable components | `npm audit` and `pip-audit`, run by hand; Rust crates, Android's Gradle dependencies, the teacher's llama.cpp build and data script, firebase-tools (run with `npx`) and CI's actions are not scanned | |
| A08 | Data integrity | Server and client spell slugs the same way | `test_slug_parity.py`, `slug.test.ts` |
| A09 | Logging | Full errors in the server log; a generic message to the client | `test_sse.py`, `test_agent_tools.py` |
| A10 | SSRF | Not applicable: the server fetches no URL a client gives | |

## Session tokens

A token is a handle, not an identity. It makes abuse cost a handshake, and it gives one cheap endpoint to rate limit.

- `/api` checks it with a FastAPI dependency. `/a2a` and `/mcp` check it with a middleware. Both call one function, so they refuse the same requests with the same body. The tests run every case against both.
- A test moves a real signature onto a forged payload and requires a refusal. Each refusal test also checks which check refused.
- Property tests require that verifying any text fails only with `InvalidSessionToken`. That covers non-ASCII bytes, which would make `hmac.compare_digest` raise, a `NaN` expiry, and a signed array.

## Sign-in

- The app sends a Firebase ID token once, for a session. The server asks Identity Toolkit who it belongs to, with the project's key, so a token from another project is refused. The account's learner id comes from that answer, never from the client.
- Development and the e2e tests use Firebase's Auth emulator, which vouches for any sign-in. The server refuses to start in production with `FIREBASE_AUTH_EMULATOR_HOST` set, and a production build of the web app ignores `VITE_FIREBASE_AUTH_EMULATOR`.

## The calculator

A model writes its expressions, so they are hostile.

- An allowlist of node types, not names. A payload inside a `lambda` has empty `co_names`, so a name check alone lets it through.
- **Bounds:** integers up to 10,000 bits, checked before `pow`, `factorial`, `comb` and `perm` run; nesting up to 50 levels, because deep recursion can overflow the WebAssembly stack; expressions up to 500 characters.
- Each refusal gives the model a reason, and takes less than half a second.

## Headers and CORS

- `CORS_ORIGINS` is an explicit list. The server refuses to start on `*`, because the tutor's requests carry credentials.
- Every response has `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` and `Content-Security-Policy: default-src 'none'`, including 401 and 429 responses.
- The web app's `public/_headers` limits `connect-src` to the API. Its one inline script is allowed by SHA-256 hash.

## Rate limits (Worker only)

| Binding | Per client address | Covers |
|---|---|---|
| `SESSION_LIMITER` | 20 a minute | `POST /api/session` |
| `GENERATE_LIMITER` | 30 a minute | Subjects, curriculum and path generation |
| `AGENT_LIMITER` | 30 a minute | `/a2a`, and starting a turn (`POST /api/chats/{chat}/turns`) |
| `API_LIMITER` | 120 a minute | The rest of `/api`, and `/mcp` |
| `PIN_LIMITER` | 10 a minute | Typing the parent PIN, or the old one to replace it: counted per account and per address, on top of the lockout that is the account's own ([Parent PIN](PARENT_PIN.md)) |
| `PAIRING_LIMITER` | 10 a minute | Asking for a TV's sign-in code (per address) and looking one up (per account and per address), on top of `API_LIMITER` ([TV sign-in](TV_SIGN_IN.md)) |

A refusal is `429` with `Retry-After: 60` and CORS headers, so the browser can read it.

### Visitor challenge (Cloudflare Turnstile)

The start of a visit to `/try` must be a person's browser. `POST /api/session` with a `visitor` (and no `deviceId`, no sign-in) signs a visitor session only after one of two proofs (`api/visitor_session.py`, `security/turnstile.py`):

- **A Turnstile token** (`challenge`), checked with Siteverify (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, form-encoded, 5 second timeout) with the secret, the token and `remoteip` from `CF-Connecting-IP` only (never `X-Forwarded-For`). The verdict must be `success`, with `action` `try` (what the widget on `/try` is rendered with) and a `hostname` the web app is served from (the same rules as `CORS_ORIGINS`, so one subdomain label of a wildcard). Tokens are single use and last 300 seconds: Siteverify refuses a second use (`timeout-or-duplicate`), so a replayed or shared token mints nothing. A token over 2048 characters is refused before Siteverify is asked.
- **The session being renewed** (`renewal`): the previous visitor session, which carries when the challenge was passed (`cha`). A renewal of the same visitor id keeps `cha`, so a child is not challenged again every 12 hours, up to 24 hours after the challenge that was passed (`VISITOR_CHALLENGE_MAX_AGE_SECONDS`); then the next renewal is `challenge_required` and the web runs the widget again. A renewal needs an unexpired session signed by this server, of the same visitor, with a `cha` that is neither in the future nor too old; a session made before `cha` existed, and a learner's, have none.

| Answer | Code | Meaning |
|---|---|---|
| `403` | `challenge_required` | no token, and no renewable session |
| `403` | `challenge_failed` | Siteverify refused the token, or its action or hostname is not ours |
| `503` | `challenge_unavailable` | Siteverify could not be reached or answered with a fault: a timeout, a connection error, a non-200 status, a body that is not JSON, `internal-error`, or a wrong secret. It fails closed: nothing is admitted, and the web offers a retry |

Learner, account, device and TV sessions and the parent flows are never challenged: only the visitor mint is. The challenge reduces abuse; it does not replace the limits below, which stay as they are.

**Configuration.** `TURNSTILE_SECRET` is a Worker secret; the widget's public site key is `VITE_TURNSTILE_SITE_KEY` in the web build. Staging and production **refuse to start without the secret**. With none (development only), a visitor's session is minted unchallenged and the web, built with no site key, sends no token. Production also **refuses Cloudflare's published test secrets** (`1x0000000000000000000000000000000AA` passes everyone, `2x0000000000000000000000000000000AA` fails everyone): they protect nothing. Staging may run the always-pass pair until its own widget exists, and then has **no bot check**; the server logs a warning at start and `GET /api/health` reports `details.challenge` as `live`, `test-always-passes`, `test-always-fails` or `off` (no secret in it), which `scripts/deploy.sh` reads after a deploy (production must say `live`). `scripts/deploy.sh` also refuses a production web build whose site key is a test key (`1x`, `2x`, `3x`).

**Web.** `https://challenges.cloudflare.com/turnstile/v0/api.js` is loaded only by `/try`, only when a visitor session has to be minted with a token (not on `/app`, `/link`, for a signed-in learner, or when a renewal suffices), and the widget is rendered with the explicit API, `appearance: interactive-only` (invisible unless the visitor has something to do) and the action `try`. `public/_headers` allows the host in `script-src` and `frame-src` and nowhere else (Cloudflare's reference asks for no `connect-src` outside pre-clearance); the service worker handles same-origin requests only, so it never sees the script. A TV's browser (`data-device="tv"`) cannot answer an interactive challenge: when the widget asks for one, `/try` says "Open graspy on a phone or computer to try it" (the Sign in link stays). The session is minted once, before the chat opens, so the challenge is once per visit, never per message.

**Not covered.** A solved challenge is worth one visit: a person (or a solving service) can still pass it, and a session minted before this deployed (no `cha`) lasts out its 12 hours. A verified visitor can renew for 24 hours and each renewed session has its own 30 turns; the network and day counts are what hold. The tests fake Siteverify at the HTTP boundary; a real widget and a real Siteverify were not exercised.

### Anonymous chat limits

`/try` lets a visitor with no account chat with the tutor, which spends model credits, so each turn a session with no account starts (`POST /api/chats/{chat}/turns`, and `POST /a2a` when the server keeps no turns) is counted in D1 (`anonymous_chat_use`, migration 0027; the Workers rate-limit bindings count a minute at most). A turn is refused with `429 try_limit` ("Try again later, or sign in to keep going") once any count is at its limit; a signed-in account's turns are never counted. A turn is counted once it is valid, fits the log and is its sender's to start, just before it begins, and, where the chat log keeps a turn once (REST, and A2A with `DURABLE_TURNS`), once per owner, chat and turn (a start sent again, or two of the same turn racing, are counted once; where the server keeps no log, as in production until `DURABLE_TURNS` is on, nothing dedupes a run, so every A2A message is counted, whatever its ids; a malformed or empty message, an oversize one and a chat that is not theirs cost nothing), and over A2A only a message that begins a turn is a turn. A signed-in account's turn reads nothing of the counts. Reading, following and stopping are not counted. `AGENT_LIMITER` (30 a minute per address) stands in front as before.

| Count | Limit | Window |
|---|---|---|
| One session (its token's id) | 30 turns | the token's 12 hours |
| One network (an IPv4 address, an IPv6 /64) | 60 turns | the clock hour (UTC) |
| One network | 200 turns | the day (UTC) |
| All anonymous visitors | 3000 turns | the day (UTC) |

Each count is added to by one conditional statement (`INSERT .. ON CONFLICT DO UPDATE SET turns = turns + 1 WHERE turns < limit`) whose changed rows say whether it was added, so turns that race cannot pass a limit together. The statement returns the new count (`RETURNING`), and an add is believed only when a row came back within the limit, never on `meta.changes` alone; if the answer cannot be read after the batch committed, the turn is given back. `scripts/probe_anonymous_counts.sh staging|production` checks on the real D1 that it answers as this assumes. A turn refused by one count gives back what it added to the others (and a turn counted twice by a race gives back the second), so a turn refused by the day's count does not spend a visitor's own; for a moment a count can read a turn too high, so a limit is reached early, never passed. What stays racy: a turn cut off between adding and giving back (the 3 second timeout, a restart) leaves its counts spent. Expired counts are deleted by each count, and only admitted turns add rows (at most the day's 3000), so the table does not grow without bound. A session is cheap to mint (`POST /api/session` is bounded by `SESSION_LIMITER`, 20 a minute per address, with or without a body), so **the session count is soft**: it stops a page that loops, and the network and day counts are the ones that hold. A school or a home on one address shares its network counts.

The network is the address in `CF-Connecting-IP`, which Cloudflare's edge sets; `X-Forwarded-For` and every other header are ignored. An IPv6 address counts as its /64. Over A2A the SDK hands the request's headers over lowercased, and the address is read from them whatever their case. Without a usable `CF-Connecting-IP` (not through the edge, as in local runs) a turn is counted for its session and in all only: fail-closed per session, never as one shared address that would lock everyone out or leave them unlimited. A call with no session is refused.

A visitor's chats are bound to the random id their browser holds (`visitor` in the session, kept in `localStorage`, then `sessionStorage`, then the page's memory; every renewal of the session sends it again), not to the session, which is renewed. When the server keeps no chat log, so there is no ownership to check, a visitor's conversation is remembered under their own id as well as the context id, so another visitor who sends the same context id reaches nothing of it. The id is the visitor's only credential: two browsers that hold the same id are one visitor. Two visitors who send the same chat id cannot share a chat, and a visitor cannot reach a learner's chat or one with no owner recorded. A device's own session, which holds no visitor id, is refused the chat. A count that cannot be made (D1 down or slow) refuses with `503 try_unavailable`: a chat that cannot be counted is an open bill. The limits are constants in `apps/server/src/app/api/anonymous_chat.py`. The provider account's spend cap is still the only absolute ceiling.

## Open risks

- **No revocation.** Tokens are signed, not stored, so a leaked token lives until it expires. Rotating `SESSION_SECRET` ends every session, and every parent PIN too, since the PIN's key is derived from it: each parent sets a new one by signing in with Google ([Parent PIN](PARENT_PIN.md)). The parent's session is the exception: setting a PIN ends the ones made before it. A TV's session is the exception in kind: it lasts an hour and is renewed from a credential the account can revoke ([TV sign-in](TV_SIGN_IN.md)).
- **The day's anonymous count can be used up.** 3000 turns a day for all visitors is a cost ceiling, and about 15 networks at 200 turns each (or any number of IPv4 addresses, or IPv6 /64s of one /48) reach it, after which `/try` answers `429` until UTC midnight; signed-in accounts are not affected. Per-network limits cannot close this, since the attacker's cost is the number of addresses; the visitor challenge (above) makes each session cost a solved Turnstile, which a script that only posts to the API cannot pay.
- **Approximate limits.** Each Cloudflare location counts on its own, per address, so a distributed client gets past them. The visitor challenge is on session issuance for `/try`; other sessions are not challenged.
- **A device id is a claim.** Whoever knows one can read that device's record. Signing in closes this for the account: its id comes from a Firebase token Google verifies, never from the client.
- **DSPy 3.4 is a beta, pinned exactly.** The httpx transport imports a private DSPy path, and a test imports it first.
- **`diskcache` has PYSEC-2026-2447 and no fixed release.** DSPy depends on it. The app replaces DSPy's disk cache with a memory-only one before serving.
- **Scanning is manual, and partial.** CI runs the tests on every pull request. `npm audit` from the repository root covers every app's npm packages in `package-lock.json`, dev tooling included. In `apps/server`, `uv run pip-audit --locked .` covers what the Worker ships (`pylock.toml`) and `uv run pip-audit` the development environment. The teacher app's Rust crates, the llama.cpp release it builds into `llama-server`, its data script's `pdfplumber`, Android's Gradle dependencies, firebase-tools (run with `npx`, outside the lockfile) and the actions CI uses are not scanned.
