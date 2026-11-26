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
| `AGENT_LIMITER` | 30 a minute | `/a2a` |
| `API_LIMITER` | 120 a minute | The rest of `/api`, and `/mcp` |
| `PIN_LIMITER` | 10 a minute | Typing the parent PIN, or the old one to replace it: counted per account and per address, on top of the lockout that is the account's own ([Parent PIN](PARENT_PIN.md)) |
| `PAIRING_LIMITER` | 10 a minute | Asking for a TV's sign-in code (per address) and looking one up (per account and per address), on top of `API_LIMITER` ([TV sign-in](TV_SIGN_IN.md)) |

A refusal is `429` with `Retry-After: 60` and CORS headers, so the browser can read it.

### Anonymous chat limits

`/try` lets a visitor with no account chat with the tutor, which spends model credits, so each turn a session with no account starts (`POST /api/chats/{chat}/turns`, and `POST /a2a` when the server keeps no turns) is counted in D1 (`anonymous_chat_use`, migration 0027; the Workers rate-limit bindings count a minute at most). A turn is refused with `429 try_limit` ("Try again later, or sign in to keep going") once any count is at its limit; a signed-in account's turns are never counted. A turn is counted once it is valid and its sender may start it (a malformed or empty message, a chat that is not theirs, and a start sent again for the same turn id cost nothing), and over A2A only a message that begins a turn is a turn. Reading, following and stopping are not counted. `AGENT_LIMITER` (30 a minute per address) stands in front as before.

| Count | Limit | Window |
|---|---|---|
| One session (its token's id) | 30 turns | the token's 12 hours |
| One network (an IPv4 address, an IPv6 /64) | 60 turns | the clock hour (UTC) |
| One network | 200 turns | the day (UTC) |
| All anonymous visitors | 3000 turns | the day (UTC) |

The counts are read in one D1 batch and a turn is added to all of them in a second, or to none when any is at its limit, so a turn refused by the day's count does not spend a visitor's own. Turns that race may pass a limit by a few. Expired counts are deleted by each count, and only admitted turns add rows (at most the day's 3000), so the table does not grow without bound. A session is cheap to mint (`POST /api/session` is bounded by `SESSION_LIMITER`, 20 a minute per address, with or without a body), so **the session count is soft**: it stops a page that loops, and the network and day counts are the ones that hold. A school or a home on one address shares its network counts.

The network is the address in `CF-Connecting-IP`, which Cloudflare's edge sets; `X-Forwarded-For` and every other header are ignored. An IPv6 address counts as its /64. Without a usable `CF-Connecting-IP` (not through the edge, as in local runs) a turn is counted for its session and in all only: fail-closed per session, never as one shared address that would lock everyone out or leave them unlimited.

A visitor's chats are bound to the random id their browser holds (`visitor` in the session, kept in `localStorage`), not to the session, which is renewed. Two visitors who send the same chat id cannot share a chat, and a visitor cannot reach a learner's chat or one with no owner recorded. A device's own session, which holds no visitor id, is refused the chat. A count that cannot be made (D1 down or slow) refuses with `503 try_unavailable`: a chat that cannot be counted is an open bill. The limits are constants in `apps/server/src/app/api/anonymous_chat.py`. The provider account's spend cap is still the only absolute ceiling.

## Open risks

- **No revocation.** Tokens are signed, not stored, so a leaked token lives until it expires. Rotating `SESSION_SECRET` ends every session, and every parent PIN too, since the PIN's key is derived from it: each parent sets a new one by signing in with Google ([Parent PIN](PARENT_PIN.md)). The parent's session is the exception: setting a PIN ends the ones made before it. A TV's session is the exception in kind: it lasts an hour and is renewed from a credential the account can revoke ([TV sign-in](TV_SIGN_IN.md)).
- **Approximate limits.** Each Cloudflare location counts on its own, per address, so a distributed client gets past them. Put Turnstile on session issuance if that happens.
- **A device id is a claim.** Whoever knows one can read that device's record. Signing in closes this for the account: its id comes from a Firebase token Google verifies, never from the client.
- **DSPy 3.4 is a beta, pinned exactly.** The httpx transport imports a private DSPy path, and a test imports it first.
- **`diskcache` has PYSEC-2026-2447 and no fixed release.** DSPy depends on it. The app replaces DSPy's disk cache with a memory-only one before serving.
- **Scanning is manual, and partial.** CI runs the tests on every pull request. `npm audit` from the repository root covers every app's npm packages in `package-lock.json`, dev tooling included. In `apps/server`, `uv run pip-audit --locked .` covers what the Worker ships (`pylock.toml`) and `uv run pip-audit` the development environment. The teacher app's Rust crates, the llama.cpp release it builds into `llama-server`, its data script's `pdfplumber`, Android's Gradle dependencies, firebase-tools (run with `npx`, outside the lockfile) and the actions CI uses are not scanned.
