# `serverBased` / `toHandler`

← [index](./README.md) · see also [errors](./errors.md), [context-provider](./context-provider.md)

## `serverBased(config)`

Creates a server entity. Does not start listening — call `.run()` on the result.

### config

| field            | type       | required | default              | notes |
|------------------|------------|----------|-----------------------|-------|
| `title`          | `string`   | yes      | —                      | throws `ServerBasedError` if missing |
| `purpose`        | `string`   | yes      | —                      | throws `ServerBasedError` if missing |
| `version`        | `string`   | yes      | —                      | throws `ServerBasedError` if missing |
| `configPath`     | `string`   | yes      | —                      | path to a `serverbased.json` function-registry config, see [Function registry](#function-registry-configpath) below. Throws `ServerBasedError` if missing — **the only way to register routes** (config-only composition, 2026-09-11; standalone `handlers`/`middlewares`/`plugins` were removed from this config, see below) |
| `runningPort`    | `number`   | no       | `8080`                 | port Express listens on |
| `networkProtocol`| `string`   | no       | `'http'`               | only `'http'` is supported; any other value throws `ServerBasedError` |
| `endpointType`   | `string`   | no       | `'server'`             | accepted values: `'server'`, `'client'`. **Not branched on in `run()` today** — has no observable effect |

**No top-level `handlers`/`middlewares`/`plugins`.** Every route, middleware, and plugin is
declared inside a function module listed in `serverbased.json` — see
[Function registry](#function-registry-configpath) below. This config shape (and `configPath`
being required) landed 2026-09-11 as part of the config-only-composition migration — see
`docs/drafts/config-only-composition.task.md` for the full rationale. `toHandler`/`toPlugin`
(below) and their shapes are unchanged; they're just always invoked through a function module now,
never directly against `serverBased(...)`'s own config.

### return value

An object exposing the resolved config plus:

- `run()` — starts the Express server. Returns a `Promise<http.Server>` that resolves once the server is listening, and **rejects** if the underlying `http.Server` emits `'error'` before that (e.g. `EADDRINUSE` when `runningPort` is already in use) — always attach a `.catch(...)` (see the example apps' `require.main === module` blocks for the pattern). The resolved server has:
  - `closeAsync()` — `Promise<void>`, wraps `server.close()`, added for convenient teardown (used throughout the test suite).

Also logs a metadata block (`title`, `purpose`, `version`) and a "N function(s) mounted" line to
console on `run()`, and one line per incoming request (`"<method> <route> invoked"`).

## `toPlugin(pluginConfig)`

Normalizes and validates a raw plugin descriptor. Called internally by `loadFunctionRegistryConfig` for every entry in a function's own `plugins`; also exported for direct use/testing.

| field    | type       | required | notes |
|----------|------------|----------|-------|
| `name`   | `string`   | yes      | key the plugin instance is exposed under on `context`. Throws `ServerBasedError` if missing |
| `plugin` | `function` | yes      | plugin class, instantiated fresh per `run()` call. Throws `ServerBasedError` if missing |

## `toHandler(handlerConfig)`

Normalizes and validates a raw handler object into the shape `serverBased` registers on Express. Called internally by `loadFunctionRegistryConfig` for every entry in a function's own `handlers`; also exported for direct use/testing.

### handlerConfig

| field         | type       | required | notes |
|---------------|------------|----------|-------|
| `route`       | `string`   | yes      | Express route path, relative to the function's own mount, e.g. `/:postId`. Throws `HandlerError` if missing |
| `method`      | `string`   | yes      | HTTP verb, case-insensitive (`toHandler` lower-cases it). Throws `HandlerError` if missing |
| `run`         | `function` | yes      | handler function — signature depends on `handlerType` (see below). Throws `HandlerError` if missing |
| `handlerType` | `string`   | yes      | `'context'` or `'origin'`. Throws `HandlerError` if missing |
| `middleware`  | `object`   | no       | optional per-handler middleware: `{ run(req, res, next) }`. Runs before this handler only, after that function's own `middlewares` |

### `handlerType`

- **`'context'`** — `run` is called as `run(context)` (async allowed). `context` is a `ContextProvider` instance wrapping the current `req`/`res` — see [context-provider.md](./context-provider.md). Errors thrown or rejected inside `run` are passed to `next(error)`, which reaches `runtimeErrorHandlingMiddleware` (see [errors.md](./errors.md)).
- **`'origin'`** — `run` is called as `run(req, res)` with the raw Express request/response. No wrapping. Synchronous throws are still caught by Express itself and reach `runtimeErrorHandlingMiddleware`; a **rejected promise from an `async run` is not awaited or caught** — it is not routed to the error middleware (deliberate scope call: error-handling safety currently targets the `context` path only, see `docs/current-process.txt`).

## `assertNoDuplicateRoutes(handlers, formatError)`

Throws `formatError(routeKey)` (a caller-supplied factory, e.g. `(routeKey) => new FunctionRegistryError(...)`) on the first repeated `"<method> <route>"` key found in `handlers`. Used by `loadFunctionRegistryConfig` for each function's own `handlers`. Exported for direct use/testing.

## `defaults` export

Enum-like object of accepted values, importable for reference/validation:

```js
{
  runningPort: 8080,
  networkProtocol: { http: 'http', socket: 'socket' },
  endpointType: { server: 'server', client: 'client' },
  handlerType: { context: 'context', origin: 'origin' },
}
```

Note `networkProtocol.socket` and `endpointType.client` are declared enum values with no corresponding implementation — see the "not branched on" notes above. `runningMode` and `routerEngine` were removed (2026-09-11) — both were accepted but never branched on.

## Minimal example

Every app is `serverbased.json` + at least one function module (see
[Function registry](#function-registry-configpath) below):

```js
// index.js
const path = require('path');
const { serverBased } = require('./lib/server-based');

serverBased({
  title: 'ping service',
  purpose: 'http api',
  version: '1.0',
  configPath: path.join(__dirname, 'serverbased.json'),
}).run();
```

```json
// serverbased.json
{ "functions": { "ping": { "path": "./functions/ping.js", "route": "/ping" } } }
```

```js
// functions/ping.js
const handlerPing = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    context.provideReply({ message: 'pong' }).send();
  },
};

module.exports = { handlers: [handlerPing] };
```

## Registering custom middleware (logging example)

Middleware is any standard Express `(req, res, next) => void` function, listed in a function
module's own `middlewares` — it runs for every route in that function only, in array order,
before the route is matched (see `example/markdown-app/functions/quote.js` for a working
example):

```js
// functions/ping.js
const loggingMiddleware = (req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} — incoming`);
  next();
};

module.exports = { handlers: [handlerPing], middlewares: [loggingMiddleware] };
```

Per-handler middleware follows the same `(req, res, next)` shape, wrapped in `{ run }` and attached to a single handler via its `middleware` field (see `handlerConfig` above) — it runs after that function's own `middlewares`, only for that route.

## Plugins

A function module's own `plugins` is an array of `{ name, plugin }` descriptors, where `plugin` is a **class**, not an instance — `run()` instantiates every plugin fresh on each call (`new plugin({ dataDir })`, see below), so separate app instances (different apps, or different test servers started from the same config) never share plugin state, and each function's plugin instances are isolated from every other function's. Each instance is exposed on every `context`-type handler's `ContextProvider` under `name`, see [context-provider.md](./context-provider.md#plugins):

```js
// functions/greet.js
class GreeterPlugin {
  greet(name) {
    return `hello, ${name}`;
  }
}

const handlerGreet = {
  route: '/:name',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { name } = context.fetchRequest().params;
    context.provideReply({ message: context.greeter.greet(name) }).send();
  },
};

module.exports = { handlers: [handlerGreet], plugins: [{ name: 'greeter', plugin: GreeterPlugin }] };
```

Throws `FunctionRegistryError` if two plugin descriptors within the same function share the same `name`, or `ServerBasedError` if a descriptor is missing `name`/`plugin` (validated by `toPlugin`, see above).

Every plugin is constructed by `run()` as `new Plugin({ dataDir })`, where `dataDir` is always the `data` folder next to `serverbased.json` (not configurable). Plugins that persist to disk (`lib/plugins/json-store.plugin.js`) keep their files there; others just ignore the argument.

A default plugin named `store` (a `Map` subclass that ignores the `{ dataDir }` argument, see `lib/plugins/state-store.plugin.js`) is auto-appended when no `store`-named plugin is supplied — this is what backs `context.provideState`/`conductState` (see [context-provider.md](./context-provider.md#state-providestateconductstate)). Supply your own `{ name: 'store', plugin: MyStoreClass }` to override it — see `example/todo-app` for a function seeding its own initial state this way. A plugin's `name` need not be `store` at all — a function can register several independently-named plugins; see [context-provider.md#custom-persistence](./context-provider.md#custom-persistence-libpluginsjson-storepluginjs) and `example/blog-app` (`postsStore`/`commentsStore`/`likesStore`, three JSON-file-backed plugins on one function, none named `store`).

## Operating without a context (`handlerType: 'origin'`)

Set `handlerType: 'origin'` to skip context injection and work with the raw Express `req`/`res` directly, like a plain Express route handler:

```js
const handlerOriginPing = {
  route: '/origin-ping',
  method: 'GET',
  handlerType: 'origin',
  run(req, res) {
    res.send({ message: 'pong' });
  },
};

module.exports = { handlers: [handlerOriginPing] };
```

See `lib/server-based.test.js` ("server-based can register handlers with context or origin type") for a side-by-side `context` vs `origin` handler on the same server. Remember: only synchronous throws from an `origin` handler reach `runtimeErrorHandlingMiddleware` — an `async run(req, res)` that rejects is not caught.

See `lib/server-based.test.js` for the fullest coverage of this API surface (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling) — it exercises `serverBased({ configPath })` against generated fixture modules (`writeFunctionConfig`, `lib/test-fixtures.js`) rather than any `example/*` app, since every example app now demonstrates one particular pattern rather than the full surface; `example/markdown-app`/`example/todo-app`/`example/blog-app` for the same per-handler middleware and a function's own scoped `middlewares` in a real app — `todo-app` overrides the default `store` plugin (see [Plugins](#plugins) above) to seed its own state at construction time; `blog-app` goes further, using three independently-named, JSON-file-backed plugins instead of `store` at all.

## Function registry (`configPath`)

`configPath` points `run()` at a `serverbased.json` file listing independently-authored "functions" — each shaped like a regular feature module (`{ handlers, middlewares?, plugins? }`) — mounted on their own `express.Router()`. This is the **only** way to register routes on a `serverBased(...)` app (required field, see the config table above). Loaded via `lib/function-registry-config.js` (`loadFunctionRegistryConfig`), a small module kept separate from `server-based.js`.

Read **once**, at startup, inside `run()` — no filesystem watching, no runtime add/remove/enable/disable. Adding, removing, or editing a function means editing `serverbased.json` and restarting the process.

```json
{
  "functions": {
    "greeter": {
      "path": "./functions/greet.js",
      "route": "/greeter"
    }
  }
}
```

- `path` — resolved relative to the location of `serverbased.json` itself (not `process.cwd()`), then `require`d.
- `route` — mount prefix for that function's own routes: a handler registered at `GET /hello/:name` inside `greet.js` becomes reachable at `GET /greeter/hello/:name`. Every function's own handler routes are self-contained (never assume a `"/"` root mount) — the mount prefix always lives in `serverbased.json`'s `route` field, not duplicated in the function's own route strings.
- Each function gets its own `express.Router()`, its own fresh plugin instances (instantiate-per-`run()` semantics), and its own middleware, applied only within that function's mount — isolated from every other function. This includes the default `store` plugin: a function that doesn't declare its own `store`-named plugin gets one auto-appended — its own fresh `Map`, so `provideState`/`conductState` inside a function's handlers work unchanged, but never share state with another function's store. A function that needs another function's data calls that function's own route over HTTP rather than reaching into its store — see `example/time-tracking-app/functions/reports.js`, `example/mini-store-app/functions/sale.js`, and the `fetchJson` export below.

### `fetchJson(url)`

Small dependency-free GET-JSON helper exported for exactly the cross-function-HTTP pattern above — one function's handler reading another function's route:

```js
const { fetchJson } = require('./lib/server-based');

const { data: entries } = await fetchJson(`${req.protocol}://${req.get('host')}/entries`);
```

Returns a `Promise` resolving with the parsed JSON response body, or rejecting on a connection error or a non-JSON body. Built on Node's `http` module rather than global `fetch`, for consistent behavior across every Node/Jest combination this repo runs on. Source: `lib/fetch-json.js`; see `lib/fetch-json.test.js`.

### Failure/collision handling — fails fast at startup

- `configPath` missing from `serverBased(...)`'s own config — throws `ServerBasedError` immediately (`configPath` is required, see the config table above).
- `configPath` given but the file doesn't exist, or `functions` is empty/absent — not an error: one `console.log` line, zero functions mounted, boot continues normally.
- A function entry missing `path` or `route`, a `path` that fails to `require`, a function's own `handlers` containing a duplicate method+route, or a function's own `plugins` sharing a `name` — throws `FunctionRegistryError` (extends `ServerBasedError`) before `app.listen`.
- Two functions sharing the same `route` — throws `FunctionRegistryError` before `app.listen` (checked inside the loader itself, before any function module is even `require`d).

See `example/hello-world-app` (renamed 2026-09-11, was `example/function-registry`) for a full working example, and `lib/function-registry-config.test.js` for the loader's fail-fast cases.
