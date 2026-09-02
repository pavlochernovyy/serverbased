# Core: factory, handler model, context layer, error handling

← [index](./README.md) · API details: [server-based.md](../api/server-based.md), [context-provider.md](../api/context-provider.md), [errors.md](../api/errors.md)

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
  - `provideState(key, value)` / `conductState(key)` — write/read a key on the app's shared `stateStore` (a `Map`), returns `this` from `provideState` for chaining.
- `injectContext(handler, stateStore)` — Express middleware adapter: builds a `ContextProvider` (passing along `stateStore`), awaits the handler, calls `next()` on success or on error (passing the error), so errors reach `runtimeErrorHandlingMiddleware`.
- `stateStore` — a `new Map()` created once in `server-based.js`'s `run()`, before the handler loop, and threaded into `injectContext` for every `context`-type handler. Lifetime = one app instance (one `serverBased(...).run()` call): shared across all of that app's handlers/requests, isolated from any other app instance. Purely in-memory scratch state, not a persistence layer — nothing survives a process restart, and there's no seeding built in (handlers seed lazily on first `conductState` miss).
  - **Composed apps share one `stateStore`** — see [compose.md](./compose.md) — key collisions across modules are the app author's responsibility, not something the framework checks.

**Error handling (`server-based.js`)**
- `ServerBasedError` and `HandlerError` (extends it) exist for config/handler validation failures, thrown synchronously during setup, before `run()` starts listening.
- `RuntimeError` (extends `ServerBasedError`) — the class handlers throw for runtime failures: `new RuntimeError(message, statusCode = 500)`. Sets `.name = 'RuntimeError'` and `.statusCode`.
- `runtimeErrorHandlingMiddleware` — registered last via `app.use(...)`, after every handler. Catches anything reaching `next(error)`: body-parser failures (e.g. malformed JSON), and errors from `context`-type handlers via `injectContext`. Responds JSON: `{ message, name }` with `err.statusCode || 500`.
- `ServerBasedError`, `HandlerError`, `RuntimeError` are all exported from `lib/server-based.js`.
- **Known gap, deliberate:** `origin`-type handlers only get this treatment for *synchronous* throws (Express catches those on its own). A rejected promise from an `async run(req, res)` origin handler is not awaited/caught anywhere — it will hang the request rather than reach `runtimeErrorHandlingMiddleware`. This was a scoped decision since the framework's real focus is the `context` path; revisit if `origin`-type handlers start doing real async work.
