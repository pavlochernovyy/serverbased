# server-based — current state

## What it is

A tiny functional wrapper around Express that turns a declarative config object into
a running HTTP server. Entry point: `serverBased(config).run()` in `lib/server-based.js`.

## What's implemented

**Core factory (`serverBased`)**
- Validates required top-level fields: `title`, `purpose`, `version`.
- Only supports `networkProtocol: 'http'` (throws otherwise) — socket protocol is a stubbed default, not built.
- Only `routerEngine: 'express'` exists; the field is accepted but not branched on.
- `runningMode` (`server`/`lambda`) and `endpointType` (`server`/`client`) are declared as enums in `defaults` but unused in `run()` — no lambda packaging, no client-mode behavior yet.
- `run()`:
  - boots Express with `express.json()`, `express.urlencoded()`, disables `x-powered-by`.
  - applies global `middlewares` array in order.
  - registers each handler on the Express router (`app[method](route, ...)`), with optional per-handler `middleware.run`.
  - logs metadata (title/purpose/version/handlers) and a per-request line to console.
  - resolves a promise with the `http.Server`, augmented with `closeAsync()` for graceful shutdown in tests.

**Handler model (`toHandler`)**
- Shape: `{ route, method, run, middleware?, handlerType }`.
- Validates `route`, `method`, `run`, `handlerType` are present; lower-cases `method`.
- Two `handlerType`s:
  - `'context'` — `run(context)` is wrapped via `injectContext`, gets a `ContextProvider` instead of raw `(req, res)`.
  - `'origin'` — `run(req, res)` gets raw Express args, no wrapping.

**Context layer (`context.provider.js`)**
- `ContextProvider` wraps `req`/`res` per request:
  - `fetchRequest()` — raw Express request.
  - `fetchParamsInt(scopeToInt)` — route params with selected keys coerced to int.
  - `provideReply(data)` — sets a reply payload, returns `this` for chaining.
  - `send()` / `sendWithCode(code)` — flushes the reply.
  - `provideState(key, value)` / `conductState(key)` — write/read a key on the app's shared `stateStore` (a `Map`), returns `this` from `provideState` for chaining. Implemented (no longer a stub).
- `injectContext(handler, stateStore)` — Express middleware adapter: builds a `ContextProvider` (passing along `stateStore`), awaits the handler, calls `next()` on success or on error (passing the error), so errors reach `runtimeErrorHandlingMiddleware`.
- `stateStore` — a `new Map()` created once in `server-based.js`'s `run()`, before the handler loop, and threaded into `injectContext` for every `context`-type handler. Lifetime = one app instance (one `serverBased(...).run()` call): shared across all of that app's handlers/requests, isolated from any other app instance. Purely in-memory scratch state, not a persistence layer — nothing survives a process restart, and there's no seeding built in (handlers seed lazily on first `conductState` miss). See `example/blog-app` and `example/todo-app` for real usage, and `lib/server-based.test.js` for a minimal example.

**Error handling (`server-based.js`)**
- `ServerBasedError` and `HandlerError` (extends it) exist for config/handler validation failures, thrown synchronously during setup, before `run()` starts listening.
- `RuntimeError` (extends `ServerBasedError`) — the class handlers throw for runtime failures: `new RuntimeError(message, statusCode = 500)`. Sets `.name = 'RuntimeError'` and `.statusCode`.
- `runtimeErrorHandlingMiddleware` — registered last via `app.use(...)`, after every handler. Catches anything reaching `next(error)`: body-parser failures (e.g. malformed JSON), and errors from `context`-type handlers via `injectContext`. Responds JSON: `{ message, name }` with `err.statusCode || 500`. This closes the gap the earlier version of this doc (and `example/blog-app/docs/state.md`) called out — malformed-body/handler errors no longer return an HTML stack trace, they get a shaped JSON error response.
- `ServerBasedError`, `HandlerError`, `RuntimeError` are all exported from `lib/server-based.js` (previously only `serverBased`/`toHandler`/`defaults` were).
- **Known gap, deliberate:** `origin`-type handlers only get this treatment for *synchronous* throws (Express catches those on its own). A rejected promise from an `async run(req, res)` origin handler is not awaited/caught anywhere — it will hang the request rather than reach `runtimeErrorHandlingMiddleware`. This was a scoped decision (see `docs/current-process.txt`) since the framework's real focus is the `context` path; revisit if `origin`-type handlers start doing real async work.

**Examples**
- `example/todo-app` — full CRUD via `provideState`/`conductState` (seeded lazily with `seedTodos()`), demonstrates global middlewares (logging that rewrites `res.send`, a pass-through "verifying" middleware) and route params (`/todo/:todoId`). Exports `{ handlers, middlewares }` and only auto-runs when executed directly (`require.main === module`), so tests can boot it on their own port.
- `example/blog-app` — full CRUD via `provideState`/`conductState` (seeded lazily with `seedPosts()`), plus a per-post view counter under a separate state key (`views:<postId>`). Same export/auto-run pattern as todo-app.
- `example/markdown-app` — single GET handler that renders markdown via `json2md` from query params, demonstrates per-handler middleware. Same export/auto-run pattern.

**Tests**
- `server-based.test.js` — factory defaults, global middleware chaining, JSON/body/query round-trips, route params, per-handler middleware, side-by-side `context` vs `origin` handler types, and `provideState`/`conductState` sharing state across requests and handlers within one app instance. Each test spins up a real server on its own port and tears it down via `closeAsync()`.
- `error-handling.test.js` — `RuntimeError` thrown in a `context` handler (sync and async), a plain `Error` defaulting to 500, a malformed-JSON body caught as JSON (not an HTML stack trace), and a synchronous throw from an `origin`-type handler. All five run through `runtimeErrorHandlingMiddleware`.
- `context.provider.test.js` — asserts `ContextProvider` methods are bound and chainable inside a running handler.
- `handler.test.js` — asserts `toHandler` normalizes and validates a handler config.
- `example/todo-app/todo-app.test.js`, `example/blog-app/blog-app.test.js`, `example/markdown-app/markdown-app.test.js` — API-level tests per example app, same real-server/`closeAsync()` pattern.
- No test currently exercises a `HandlerError`/`ServerBasedError` being thrown during setup, or an async rejection from an `origin`-type handler (known unhandled gap, see above).
