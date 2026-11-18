# MCP Apps: the card host against the standard and against 234's list

The tutor's cards are MCP Apps views. The web app is the host; the server serves the sandbox the views run in. This page checks that host against two lists: the sandbox gaps 234 recorded for itself (`docs/mcp-apps-compliance.md` in the 234 repository), and the rules of the MCP Apps specification. It changes no behaviour. Each gap links to its backlog issue in `getlatentic/planning`.

## Sources

- **MCP Apps specification, stable revision `2026-01-26`** (`specification/2026-01-26/apps.mdx` in `modelcontextprotocol/ext-apps`, blob `43fef209d449`). Read from the repository at tag `v2.1.0` (released 2026-11-10); the last commit that touched `specification/` is `19256f5` (2026-11-04). The `draft` revision was read for what it adds (host capabilities `message` and `updateModelContext`, `ui/notifications/request-teardown`, `ui/download-file`).
- **SDK.** `@modelcontextprotocol/ext-apps` `^2.0.0`, locked at 2.0.0 (`package-lock.json`). Its `AppBridge` was read at `v2.1.0` (`src/app-bridge.ts`) for what it does when a handler is not set.
- **234's list.** `/Users/dev/workspace/234/docs/mcp-apps-compliance.md`, which also names rules 1 to 8 of the "Sandbox proxy" section as its yardstick.
- Read on 2026-11-18, against `main` at `3bb9f3d`.

## How graspy differs from 234

- **The sandbox is the API's origin**, not a Worker of its own: `/ui-sandbox/<build>/` on the server (`apps/server/src/app/mcp/sandbox.py:1`). Each build of the views has its own sandbox, and a service worker registered there serves the pages and the build's files offline (`ui-sandbox-sw.js`).
- **Two frames, not three.** The proxy page (`sandbox.html`) frames a view page (`/ui-sandbox/<build>/frame`) and writes the view's HTML into it.
- **Only graspy's own views run.** The view's policy is fixed on the server (`sandbox.py:59-62`), not taken from a request or from the resource's `_meta.ui.csp`. This makes the spec's rules about third-party domains (host allowlist, a warning to the person, `domain`) not applicable.

## 234's list

| # | Item | Status | Where | Gap |
|---|---|---|---|---|
| 1 | Sandbox origin separate from the host | Met | The sandbox is on the API's origin, the host on the app's. A host on the sandbox's own origin is refused with 400 (`apps/server/src/app/mcp/sandbox_routes.py:39-46`; the worker does the same, `apps/server/ui/src/sandbox/ui-sandbox-sw.js:43-55`). Only a host the server's CORS list names may frame it (`apps/server/tests/test_mcp_sandbox.py:54-82`). The proxy refuses to run unless framed (`sandbox.html:49`). The host's own policy lets only the API's origin be framed (`apps/web/public/_headers:24`, `frame-src`, which also names Firebase's auth domain). | Not tested in a browser: [planning#898](https://github.com/getlatentic/planning/issues/898) |
| 2 | Proxy CSP pinned by hash | **Not met** | The proxy policy has `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` (`sandbox.py:68-72`); the test asserts it (`test_mcp_sandbox.py:96`). The host app's own policy is pinned by hash and tested (`apps/web/src/lib/csp.test.ts:18-44`, `apps/web/public/_headers:24`), so the proxy's script is the one that is open (the view page's `'unsafe-inline'` is the spec's own default, `sandbox.py:95-96`). | [planning#892](https://github.com/getlatentic/planning/issues/892) |
| 3 | View's CSP in the response headers | Met | The view page is served with its policy in `content-security-policy` (`sandbox_routes.py:69-76`, built by `view_policy`, `sandbox.py:84-107`); offline, the worker sets the same header (`ui-sandbox-sw.js:65-72`) and a test compares the two (`test_mcp_sandbox.py:143-165`). The view is written into that page, so the policy stays in force. | That it holds for the written HTML is not tested in a browser: [planning#898](https://github.com/getlatentic/planning/issues/898) |
| 4 | `ui/message` and `ui/update-model-context` as rate-limited text | **Not met** | `ui/message`: text is joined and passed on; the only guard is "no other turn is running" (`apps/web/src/features/learn/ui-apps/view-bridge.ts:56-57`, `apps/web/src/features/learn/hooks/use-app-host.ts:33-38`). No rate limit, no length cap; empty text is answered as a success and then dropped (no turn is sent, and the view's queued tool calls are cleared), and other blocks are dropped without an error. `ui/update-model-context`: no handler, so the SDK answers with an error (`src/app-bridge.ts`, "No onupdatemodelcontext handler set"). The lesson host refuses every `ui/message` (`lesson-host.ts:50`). | [planning#893](https://github.com/getlatentic/planning/issues/893), [planning#894](https://github.com/getlatentic/planning/issues/894) |
| 5 | `ui/open-link` for http(s) only | Met, with a gap | Only `^https?://` is opened, in a new tab with `noopener,noreferrer` (`view-bridge.ts:58-62`). Any other link answers `{}`, a success, where the spec's example answers an error. No test. | [planning#896](https://github.com/getlatentic/planning/issues/896) |
| 6 | Teardown on `pagehide` | **Not met** | `ui/resource-teardown` is sent from the effect's cleanup, with a 500 ms wait (`apps/web/src/features/learn/ui-apps/app-frame.tsx:99-102`, `view-bridge.ts:28-29,121-127`). Closing the tab runs no cleanup, and on unmount the frame is already gone when the cleanup runs, so it probably hears nothing then either (not run in a browser). (`pagehide` is used for the voice recorder only, `apps/web/src/lib/voice/recorder.ts:88`.) | [planning#895](https://github.com/getlatentic/planning/issues/895) |

## The specification, rule by rule

"Sandbox proxy", rules 1 to 8.

| Rule | Status | Where | Gap |
|---|---|---|---|
| 1. Host and sandbox have different origins | Met | See item 1 above. | |
| 2. Sandbox has `allow-scripts` and `allow-same-origin` | Met | The host frames the proxy with `allow-scripts allow-same-origin allow-forms` (`app-frame.tsx:41`); the proxy frames the view with the same three (`sandbox.html:41,74`). `allow-forms` is beyond the rule; both policies carry `form-action 'none'` (`sandbox.py:78,104`). | |
| 3. Proxy sends `ui/notifications/sandbox-proxy-ready` | Met | `sandbox.html:157-160`, addressed to the host named in `?host=`. | |
| 4. Host then sends the raw HTML in `sandbox-resource-ready` | Met | The host waits for the proxy's message from the frame's own window (`view-bridge.ts:85-95`), connects, then sends the view (`view-bridge.ts:113-115`). The proxy takes a view only from its host's origin, once (`sandbox.html:140-145`, `proxy-page.test.ts:196`). | |
| 5. Proxy loads the HTML under the declared CSP, `frame-src`, `base-uri`, `object-src 'none'`, `allow` from permissions | Met, by a fixed policy | `view_policy` has `default-src 'none'`, `frame-src 'none'`, `base-uri` the server's origin, `object-src 'none'`, `connect-src 'none'` (`sandbox.py:84-107`). The `csp` the host sends in `sandbox-resource-ready` is not read (`sandbox.html:71`): views declare nothing beyond their own origin (`sandbox.py:59-62`), so nothing is allowed that was not. Differences from the spec's snippet: no `'self'` (the server's origin is named instead), no `'self'` in `connect-src`, and `form-action` and `frame-ancestors` added; these tighten or name the same origin. Three sources are wider than the snippet: `blob:` in `img-src` and `media-src` and `data:` in `font-src` (`sandbox.py:97-99`). The `allow` attribute is built from the resource's `permissions`, filtered by a four-key list that uses `in`, which also matches inherited names (`sandbox.html:42-47,75-78`). Nothing is granted today: no view declares permissions, the host's frame has no `allow` attribute (`app-frame.tsx:38-43`), and the host's `Permissions-Policy` (`apps/web/public/_headers:23`) denies camera and location to every frame. | Allowlist: [planning#897](https://github.com/getlatentic/planning/issues/897) |
| 6. Forward everything not `ui/notifications/sandbox-*`, both ways; nothing to the view before `initialized` | **Partly met** | Order met: the host waits for `initialized` before it sends `tool-input` and `tool-result` (`view-bridge.ts:110-118`). Forwarding is limited to the right window and origin (`sandbox.html:140-155`, `proxy-page.test.ts:209-225`). But the relay forwards the view's messages to the host whatever their method, and forwards host messages with the `sandbox-` prefix other than `resource-ready` to the view. | [planning#897](https://github.com/getlatentic/planning/issues/897) |
| 7. Sandbox does not create requests | Met, with one addition | The proxy sends the host `proxy-ready`, and, when asked to keep a build, the notification `graspy/sandbox-kept` (`sandbox.html:134-137`), to a hidden frame that has no view (`apps/web/src/lib/mcp/sandbox.ts:36-47`). Neither is a request. | |
| 8. Host may forward non-`ui/` messages, and may block some | Met | `tools/call` goes to the server or, offline, to the outbox (`view-bridge.ts:50-55`). The bridge declares `openLinks`, `serverTools` and `logging` only (`view-bridge.ts:47`), so `resources/read` and the rest are not offered. | Whether the host refuses a tool whose visibility lacks `app` is not checked here: that is the server's, see the note below. |

Other rules.

| Rule | Status | Where | Gap |
|---|---|---|---|
| Restrictive default CSP, no loosening | Met | `view_policy` of the server's own declaration is stricter than the spec's default (`sandbox.py:84-107`). The worker builds it from its own script, never from a cache (`ui-sandbox-sw.js:1-9`). | |
| `object-src 'none'` | Met | `sandbox.py:77,103`. | |
| Audit trail: log CSP configurations | Not applicable | One fixed policy, in source. | |
| Warn the person when a view needs external domains | Not applicable | A view declares none. | |
| Host allowlist of domains; `domain` (own origin per view) | Not applicable | Only graspy's views run, on one origin. | |
| Host sandbox override (`sandbox` in the notification) | Met, by ignoring it | The proxy never takes the host's flags (`sandbox.html:67-70`). | |
| `hostCapabilities`: `sandbox.csp`, `sandbox.permissions` | Not met, no effect | Not declared (`view-bridge.ts:47`). Graspy's views read neither. | None today: no view reads them. |
| Draft `message` and `updateModelContext` capabilities | Not met | Not declared, and the draft's content-modality shape is not in the stable revision. | Part of [planning#893](https://github.com/getlatentic/planning/issues/893) and [planning#894](https://github.com/getlatentic/planning/issues/894). |
| `ui/resource-teardown` before any teardown | Partly met | Sent from a passive effect's cleanup. On a locale or resource change the frame is still in the page and hears it; on unmount or a route change React has already removed the frame, so the message probably reaches no one (not run in a browser; 234 records the same: "Removing a frame from the page leaves nobody to tell"). Not sent on page close. | [planning#895](https://github.com/getlatentic/planning/issues/895) |
| `ui/notifications/size-changed` handled | Met | `view-bridge.ts:63-65`. | |
| `ui/request-display-mode` | Met | `availableDisplayModes: ["inline"]` (`app-frame.tsx:85`); the SDK answers the current mode. | |
| `tool-input`, `tool-result` after `initialized` | Met | `view-bridge.ts:117-118`. `tool-input-partial` and `tool-cancelled` are not sent: a card is shown for a finished call. | |
| Log view-initiated calls | Met | `notifications/message` is logged (`view-bridge.ts:66`). Other requests are handled or refused by the SDK. | |
| Host's own CSP: no `'unsafe-inline'` scripts, `frame-ancestors 'none'`, frames only the API and Firebase | Met | `apps/web/public/_headers:24`; tested for the hash, the WebSocket origin and `'unsafe-inline'` (`csp.test.ts:18-44`). `frame-src` is not tested. | |

## What the gaps add up to

Of 234's six items, two are met, one is met with a small gap, and three are not met (the proxy's hash, the two message types, teardown on `pagehide`). One more rule, 6, is only partly met. Seven backlog issues cover them, the last for a missing browser-level test:

| Issue | Covers |
|---|---|
| [planning#892](https://github.com/getlatentic/planning/issues/892) | Hash-pin the proxy's script and style |
| [planning#893](https://github.com/getlatentic/planning/issues/893) | Limits on `ui/message` |
| [planning#894](https://github.com/getlatentic/planning/issues/894) | `ui/update-model-context`: support or refuse on purpose |
| [planning#896](https://github.com/getlatentic/planning/issues/896) | `ui/open-link` error and tests |
| [planning#895](https://github.com/getlatentic/planning/issues/895) | Teardown on `pagehide` |
| [planning#897](https://github.com/getlatentic/planning/issues/897) | Proxy relay of `sandbox-*` messages, permissions allowlist |
| [planning#898](https://github.com/getlatentic/planning/issues/898) | A real-browser test of the sandbox |

## Not checked

- **Browsers.** Nothing here ran in a browser. Every "Met" is from reading the code and its tests, which read header strings or run against a stub page (`test_mcp_sandbox.py`, `proxy-page.test.ts`).
- **Same site.** The app and the API may share a registrable domain; the sandbox is a different origin but not necessarily a different site. Whether a cookie set from the sandbox's origin could reach the app was not checked.
- **Tool visibility** (`visibility: ["app"]`, "Host MUST reject `tools/call` for tools that lack `app`") is enforced by the server, not by the host code read here; the Kotlin app was not read.
- **The Android app** hosts the same views in its own `AppView` and is not covered.
- **Cloudflare Pages and the Worker.** The headers were read from the repository, not from a deployed response.
