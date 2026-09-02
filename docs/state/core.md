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
  - `provideState(key, value)` / `conductState(key)` — thin wrapper around the injected `store` plugin (`this.store.set/get`), returns `this` from `provideState` for chaining. See "Plugin system" below.
- `injectContext(handler, plugins)` — Express middleware adapter: builds a `ContextProvider` (passing along the resolved `plugins` array), awaits the handler, calls `next()` on success or on error (passing the error), so errors reach `runtimeErrorHandlingMiddleware`.

**Plugin system (`context.provider.js` + `server-based.js`)**
- A plugin descriptor is `{ name, plugin }`, where `plugin` is a **class**, not an instance. `serverBased(...).run()` instantiates every plugin fresh (`new plugin()`) once per `run()` call, before the handler loop, and threads the resulting `[{ name, instance }]` array into `injectContext` for every `context`-type handler.
- `ContextProvider`'s constructor iterates that array and does `this[name] = instance` — so a plugin `{ name: 'cart', plugin: CartPlugin }` becomes reachable inside a handler as `context.cart`.
- Lifetime = one app instance (one `serverBased(...).run()` call): every plugin instance is shared across all of that app's handlers/requests, but a *separate* `run()` call (a different app, or a different test server built from the same config) gets its own fresh instances — no state leaks across app instances. See `example/mini-store/mini-store.test.js` ("each run() gets its own CartPlugin instance") for this proven end-to-end.
- `toPlugin({ name, plugin })` (in `server-based.js`) validates a descriptor, mirroring `toHandler`; `run()` also rejects two plugins sharing the same `name` (throws `ServerBasedError`), the same fail-fast-at-startup posture `compose.js` already uses for duplicate routes.
- **Default `store` plugin** (`lib/plugins/state-store.plugin.js`): `{ name: 'store', plugin: Map }` — a plain `Map` already exposes `get`/`set`, exactly what `provideState`/`conductState` need. `run()` auto-appends it only when the caller hasn't supplied their own plugin named `store`, which is what keeps `context.provideState`/`conductState` working unchanged for any handler that never touches the plugin system directly. Purely in-memory scratch state, not a persistence layer — nothing survives a process restart, and there's no seeding built in (handlers seed lazily on first `conductState` miss). Supplying your own `{ name: 'store', plugin: MyStoreClass }` (any class exposing `get`/`set`) overrides the default.
- **Composed apps merge `plugins`, not share one instance** — `composeModules` (see [compose.md](./compose.md)) concatenates each module's `plugins` array and throws `ComposeError` on a duplicate plugin `name` across modules, the same way it already does for duplicate routes. Two modules that each bring their own named plugin (e.g. `mini-store`'s `cart`/`sale` vs `blog-app`'s implicit default `store`) stay fully isolated — see `example/combined-mini-store-blog`.
- See [context-provider.md#plugins](../api/context-provider.md#plugins) and [server-based.md#plugins](../api/server-based.md#plugins) for the full API surface, and `example/mini-store` (`CartPlugin`, `SalePlugin`) for a from-scratch example of writing your own plugin.

**Error handling (`server-based.js`)**
- `ServerBasedError` and `HandlerError` (extends it) exist for config/handler validation failures, thrown synchronously during setup, before `run()` starts listening.
- `RuntimeError` (extends `ServerBasedError`) — the class handlers throw for runtime failures: `new RuntimeError(message, statusCode = 500)`. Sets `.name = 'RuntimeError'` and `.statusCode`.
- `runtimeErrorHandlingMiddleware` — registered last via `app.use(...)`, after every handler. Catches anything reaching `next(error)`: body-parser failures (e.g. malformed JSON), and errors from `context`-type handlers via `injectContext`. Responds JSON: `{ message, name }` with `err.statusCode || 500`.
- `ServerBasedError`, `HandlerError`, `RuntimeError` are all exported from `lib/server-based.js`.
- **Known gap, deliberate:** `origin`-type handlers only get this treatment for *synchronous* throws (Express catches those on its own). A rejected promise from an `async run(req, res)` origin handler is not awaited/caught anywhere — it will hang the request rather than reach `runtimeErrorHandlingMiddleware`. This was a scoped decision since the framework's real focus is the `context` path; revisit if `origin`-type handlers start doing real async work.
