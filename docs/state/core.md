# Core: factory, handler model, context layer, error handling

← [index](../README.md) · API details: [server-based.md](../api/server-based.md), [context-provider.md](../api/context-provider.md), [errors.md](../api/errors.md)

**Core factory (`serverBased`)**
- Validates required top-level fields: `title`, `purpose`, `version`, `configPath`.
- **Config-only composition (2026-09-11)**: `configPath` is the *only* way to register routes — `serverBased(...)` no longer accepts top-level `handlers`/`middlewares`/`plugins` at all (removed, not deprecated). Every route, middleware, and plugin lives inside a function module listed in `serverbased.json` — see "Function registry" below. See `docs/drafts/config-only-composition.task.md` for the full migration record; every `example/*` app was migrated to this shape first, then the top-level fields were removed from `server-based.js` itself once no caller needed them.
- Only supports `networkProtocol: 'http'` (throws otherwise) — socket protocol is a stubbed default, not built.
- `endpointType` (`server`/`client`) is declared as an enum in `defaults` but unused in `run()` — no client-mode behavior yet.
- `runningMode` and `routerEngine` were removed from the config/`defaults` (2026-09-11) — both were accepted but never branched on (no lambda packaging ever existed, Express was the only router engine). See [open-items.md](./open-items.md).
- `run()`:
  - boots Express with `express.json()`, `express.urlencoded()`, disables `x-powered-by`.
  - loads `serverbased.json` (via `loadFunctionRegistryConfig`) and mounts each function on its own `express.Router()` — this is now the entire routing/middleware/plugin wiring pass, see "Function registry" below.
  - logs metadata (title/purpose/version) and a "N function(s) mounted" line, plus a per-request line, to console.
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
- A plugin descriptor is `{ name, plugin }`, where `plugin` is a **class**, not an instance. For each function, `run()` instantiates every one of that function's plugins fresh (`new plugin()`) once per `run()` call, before that function's handlers are registered, and threads the resulting `[{ name, instance }]` array into `injectContext` for every `context`-type handler on that function's router.
- `ContextProvider`'s constructor iterates that array and does `this[name] = instance` — so a plugin `{ name: 'cart', plugin: CartPlugin }` becomes reachable inside a handler as `context.cart`.
- Lifetime = one app instance (one `serverBased(...).run()` call): every plugin instance is shared across all of that function's handlers/requests, but a *separate* `run()` call (a different app, or a different test server built from the same config) gets its own fresh instances — no state leaks across app instances. See `example/mini-store-app/mini-store-app.test.js` ("each run() gets its own cart function's plugin instance") for this proven end-to-end.
- `toPlugin({ name, plugin })` (in `server-based.js`) validates a descriptor, mirroring `toHandler`; `loadFunctionRegistryConfig` also rejects two plugins within the same function sharing the same `name` (throws `FunctionRegistryError`), the same fail-fast-at-startup posture used for duplicate routes.
- **Default `store` plugin** (`lib/plugins/state-store.plugin.js`): `{ name: 'store', plugin: Map }` — a plain `Map` already exposes `get`/`set`, exactly what `provideState`/`conductState` need. `run()` auto-appends it to a function's own plugins only when that function hasn't supplied its own plugin named `store`, which is what keeps `context.provideState`/`conductState` working unchanged for any handler that never touches the plugin system directly. Purely in-memory scratch state, not a persistence layer — nothing survives a process restart. Supplying your own `{ name: 'store', plugin: MyStoreClass }` (any class exposing `get`/`set`) overrides the default — `example/todo-app`/`example/blog-app`/`example/time-tracking-app`'s `/entries`/`/projects` all do this to seed their initial state at construction time instead of every handler lazily seeding on first `conductState` miss.
- **Functions each get their own isolated plugin instances, not a merge** — `example/mini-store-app`'s `functions/cart.js` (`cart` plugin) and `functions/sale.js` (`sale` plugin) are two separate config-loaded functions, each with its own named plugin scoped to its own router — see "Function registry" below. `sale`'s handler needs `cart`'s data across that isolation boundary and reads it over `cart`'s own HTTP route rather than sharing a plugin instance.
- See [context-provider.md#plugins](../api/context-provider.md#plugins) and [server-based.md#plugins](../api/server-based.md#plugins) for the full API surface, and `example/mini-store-app` (`CartPlugin`, `SalePlugin`) for a from-scratch example of writing your own plugin.

**Function registry (`configPath` + `lib/function-registry-config.js`)**
- Required top-level `configPath` field on `serverBased(...)` — the only way to register routes (see "Core factory" above). `run()` calls `loadFunctionRegistryConfig(configPath)` (a small module kept separate from `server-based.js`) before `app.listen`, and mounts every returned function. This used to be additive alongside the app's own top-level `handlers`; since 2026-09-11 it's the sole mechanism.
- Each function gets its own default `store` — its own fresh `Map` instance per function, per `run()` call, isolated from every other function's store. Deliberate: a function's store simulates its own database, the way a real microservice owns its own; cross-function data access goes through the owning function's own HTTP route, not shared memory — see `example/time-tracking-app/functions/reports.js`, `example/mini-store-app/functions/sale.js`, and [open-items.md](./open-items.md).
- **`fetchJson(url)`** (`lib/fetch-json.js`, exported from `lib/server-based.js`) — a small dependency-free GET-JSON helper (Node's built-in `http`, not global `fetch`, for consistent behavior across every Node/Jest combination this repo runs on) exposed specifically for this pattern: a function's handler calling another function's route over HTTP. Both cross-function call sites in the examples (`example/time-tracking-app/functions/reports.js`, `example/mini-store-app/functions/sale.js`) use it instead of each hand-rolling its own copy. See `lib/fetch-json.test.js`.
- `serverbased.json` lists functions as `{ "<id>": { "path": "...", "route": "..." } }`. Each function is a plain module exporting `{ handlers, middlewares?, plugins? }`, `require`d once at startup (`path` resolved relative to the config file), mounted on its own `express.Router()` at `route`, with its own fresh plugin instances isolated from every other function. A function's own handler routes are always self-contained (never assume a `"/"` root mount) — the mount prefix lives only in `serverbased.json`'s `route` field.
- **Static, not live**: no `fs.watch`, no runtime registry, no per-function status/state machine. Enable/disable/add a function by editing `serverbased.json` and restarting the process — an earlier live-filesystem-watch direction was explicitly superseded by this simpler, declarative-config design (see [`drafts/function-registry.task.md`](../drafts/function-registry.task.md)).
- **Fail-fast at startup**: missing `path`/`route` on an entry, a `require` failure, a duplicate route within one function's own `handlers`, a duplicate plugin `name` within one function's own `plugins`, or two functions sharing a `route`, all throw `FunctionRegistryError` before `app.listen` — the route-uniqueness check happens inside the loader itself, before any function module is even `require`d, so `server-based.js`'s own function-mounting loop no longer needs (or has) a redundant collision check. An empty/absent `functions` key, or a `configPath` pointing at a missing file, is *not* an error — logs one line and mounts nothing.
- `registerHandlers(router, handlers, pluginInstances)` (`server-based.js`) registers a function's already-validated handlers onto its own `express.Router()` with consistent context-injection wiring — shared by every function's mounting pass.
- See [server-based.md#function-registry-configpath](../api/server-based.md#function-registry-configpath) for the full field/behavior reference, `example/hello-world-app` (renamed 2026-09-11, was `example/function-registry`) for a working example, and `lib/function-registry-config.test.js` for the loader's fail-fast cases.

**Error handling (`server-based.js`)**
- `ServerBasedError` and `HandlerError` (extends it) exist for config/handler validation failures, thrown synchronously during setup, before `run()` starts listening.
- `RuntimeError` (extends `ServerBasedError`) — the class handlers throw for runtime failures: `new RuntimeError(message, statusCode = 500)`. Sets `.name = 'RuntimeError'` and `.statusCode`.
- `runtimeErrorHandlingMiddleware` — registered last via `app.use(...)`, after every handler. Catches anything reaching `next(error)`: body-parser failures (e.g. malformed JSON), and errors from `context`-type handlers via `injectContext`. Responds JSON: `{ message, name }` with `err.statusCode || 500`.
- `ServerBasedError`, `HandlerError`, `RuntimeError` are all exported from `lib/server-based.js`.
- **Known gap, deliberate:** `origin`-type handlers only get this treatment for *synchronous* throws (Express catches those on its own). A rejected promise from an `async run(req, res)` origin handler is not awaited/caught anywhere — it will hang the request rather than reach `runtimeErrorHandlingMiddleware`. This was a scoped decision since the framework's real focus is the `context` path; revisit if `origin`-type handlers start doing real async work.
