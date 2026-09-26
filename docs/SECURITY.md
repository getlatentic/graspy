# Security

Signing in is optional and goes through Google by Firebase, so graspy keeps no passwords. The assets are the model budget, the service itself and the learner's record. Everything a learner types reaches a model, and the model can repeat it, so all model output is untrusted.

## Controls (OWASP Top 10, 2021)

| # | Risk | Control | Test |
|---|---|---|---|
| A01, A07 | Access control, authentication | Signed session token on generation, the learner's record, `/a2a` and `/mcp`; expiry; signature bound to the payload. A sign-in checked with Identity Toolkit | `test_session.py`, `test_accounts.py` |
| A02 | Cryptography | HMAC-SHA256 with a fixed algorithm; TLS at Cloudflare | `test_session.py` |
| A03 | Injection | The calculator evaluates an AST allowlist with size and depth bounds; no `eval` | `test_sandbox.py` |
| A05 | Misconfiguration | CORS allowlist, docs off in production, security headers, CSP by hash | `test_cors.py`, `test_security_headers.py`, `csp.test.ts` |
| A06 | Vulnerable components | `npm audit`, `pip-audit`, run by hand | |
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

A refusal is `429` with `Retry-After: 60` and CORS headers, so the browser can read it.

## Open risks

- **No revocation.** Tokens are signed, not stored, so a leaked token lives until it expires. Rotating `SESSION_SECRET` ends every session.
- **Approximate limits.** Each Cloudflare location counts on its own, per address, so a distributed client gets past them. Put Turnstile on session issuance if that happens.
- **A device id is a claim.** Whoever knows one can read that device's record. Signing in closes this for the account: its id comes from a Firebase token Google verifies, never from the client.
- **DSPy 3.4 is a beta, pinned exactly.** The httpx transport imports a private DSPy path, and a test imports it first.
- **`diskcache` has PYSEC-2026-2447 and no fixed release.** DSPy depends on it. The app replaces DSPy's disk cache with a memory-only one before serving.
- **Scanning is manual.** CI runs the tests on every pull request; `npm run audit` and `uv run pip-audit` are run by hand.
