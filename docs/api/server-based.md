# `serverBased` / `toHandler`

← [index](./README.md) · see also [errors](./errors.md), [context-provider](./context-provider.md), [compose](./compose.md)

## `serverBased(config)`

Creates a server entity. Does not start listening — call `.run()` on the result.

### config

| field            | type       | required | default              | notes |
|------------------|------------|----------|-----------------------|-------|
| `title`          | `string`   | yes      | —                      | throws `ServerBasedError` if missing |
| `purpose`        | `string`   | yes      | —                      | throws `ServerBasedError` if missing |
| `version`        | `string`   | yes      | —                      | throws `ServerBasedError` if missing |
| `runningPort`    | `number`   | no       | `8080`                 | port Express listens on |
| `runningMode`    | `string`   | no       | `'server'`             | accepted values: `'server'`, `'lambda'`. **Not branched on in `run()` today** — has no observable effect |
| `networkProtocol`| `string`   | no       | `'http'`               | only `'http'` is supported; any other value throws `ServerBasedError` |
| `routerEngine`   | `string`   | no       | `'express'`            | accepted value: `'express'`. **Not branched on** — Express is used unconditionally regardless of this field |
| `endpointType`   | `string`   | no       | `'server'`             | accepted values: `'server'`, `'client'`. **Not branched on in `run()` today** — has no observable effect |
| `handlers`       | `array`    | no       | `[]`                    | array of handler configs, see below. Throws `ServerBasedError` if two handlers register the same `method`+`route` (via `assertNoDuplicateRoutes`, see below) |
| `middlewares`    | `array`    | no       | `[]`                    | array of Express middleware functions `(req, res, next) => void`, applied globally in order, before any handler |
| `plugins`        | `array`    | no       | `[]`                    | array of plugin descriptors `{ name, plugin }`, see [Plugins](#plugins) below |
| `configPath`     | `string`   | no       | `undefined`             | path to a `serverbased.json` function-registry config, see [Function registry](#function-registry-configpath) below |

### return value

An object exposing the resolved config plus:

- `run()` — starts the Express server. Returns a `Promise<http.Server>` that resolves once the server is listening, and **rejects** if the underlying `http.Server` emits `'error'` before that (e.g. `EADDRINUSE` when `runningPort` is already in use) — always attach a `.catch(...)` (see the example apps' `require.main === module` blocks for the pattern). The resolved server has:
  - `closeAsync()` — `Promise<void>`, wraps `server.close()`, added for convenient teardown (used throughout the test suite).

Also logs a metadata block (`title`, `purpose`, `version`, `handlers`) to console on `run()`, and one line per incoming request (`"<method> <route> invoked"`).

## `toPlugin(pluginConfig)`

Normalizes and validates a raw plugin descriptor. Called internally by `run()` for every entry in `plugins`; also exported for direct use/testing.

| field    | type       | required | notes |
|----------|------------|----------|-------|
| `name`   | `string`   | yes      | key the plugin instance is exposed under on `context`. Throws `ServerBasedError` if missing |
| `plugin` | `function` | yes      | plugin class, instantiated fresh per `run()` call. Throws `ServerBasedError` if missing |

## `toHandler(handlerConfig)`

Normalizes and validates a raw handler object into the shape `serverBased` registers on Express. Called internally by `run()` for every entry in `handlers`; also exported for direct use/testing.

### handlerConfig

| field         | type       | required | notes |
|---------------|------------|----------|-------|
| `route`       | `string`   | yes      | Express route path, e.g. `/posts/:postId`. Throws `HandlerError` if missing |
| `method`      | `string`   | yes      | HTTP verb, case-insensitive (`toHandler` lower-cases it). Throws `HandlerError` if missing |
| `run`         | `function` | yes      | handler function — signature depends on `handlerType` (see below). Throws `HandlerError` if missing |
| `handlerType` | `string`   | yes      | `'context'` or `'origin'`. Throws `HandlerError` if missing |
| `middleware`  | `object`   | no       | optional per-handler middleware: `{ run(req, res, next) }`. Runs before this handler only, after global `middlewares` |

### `handlerType`

- **`'context'`** — `run` is called as `run(context)` (async allowed). `context` is a `ContextProvider` instance wrapping the current `req`/`res` — see [context-provider.md](./context-provider.md). Errors thrown or rejected inside `run` are passed to `next(error)`, which reaches `runtimeErrorHandlingMiddleware` (see [errors.md](./errors.md)).
- **`'origin'`** — `run` is called as `run(req, res)` with the raw Express request/response. No wrapping. Synchronous throws are still caught by Express itself and reach `runtimeErrorHandlingMiddleware`; a **rejected promise from an `async run` is not awaited or caught** — it is not routed to the error middleware (deliberate scope call: error-handling safety currently targets the `context` path only, see `docs/current-process.txt`).

## `assertNoDuplicateRoutes(handlers, formatError)`

Throws `formatError(routeKey)` (a caller-supplied factory, e.g. `(routeKey) => new ServerBasedError(...)`) on the first repeated `"<method> <route>"` key found in `handlers`. Used internally by `run()` for the app's own top-level `handlers`, and by `loadFunctionRegistryConfig` for each function's own `handlers` — the single implementation both the host app and every function's duplicate-route check share. Exported for direct use/testing.

## `defaults` export

Enum-like object of accepted values, importable for reference/validation:

```js
{
  runningPort: 8080,
  runningMode: { server: 'server', lambda: 'lambda' },
  networkProtocol: { http: 'http', socket: 'socket' },
  routerEngine: { express: 'express' },
  endpointType: { server: 'server', client: 'client' },
  handlerType: { context: 'context', origin: 'origin' },
}
```

Note `networkProtocol.socket`, `runningMode.lambda`, and `endpointType.client` are declared enum values with no corresponding implementation — see the "not branched on" notes above.

## Minimal example

```js
const { serverBased } = require('./lib/server-based');

const handlerPing = {
  route: '/ping',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    context.provideReply({ message: 'pong' }).send();
  },
};

serverBased({
  title: 'ping service',
  purpose: 'http api',
  version: '1.0',
  handlers: [handlerPing],
}).run();
```

## Registering custom middleware (logging example)

Global middleware is any standard Express `(req, res, next) => void` function, passed via `middlewares` — it runs for every handler, in array order, before the route is matched:

```js
const loggingMiddleware = (req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} — incoming`);
  next();
};

serverBased({
  title: 'ping service',
  purpose: 'http api',
  version: '1.0',
  handlers: [handlerPing],
  middlewares: [loggingMiddleware],
}).run();
```

Per-handler middleware follows the same `(req, res, next)` shape, wrapped in `{ run }` and attached to a single handler via its `middleware` field (see `handlerConfig` above) — it runs after global `middlewares`, only for that route.

## Plugins

`plugins` is an array of `{ name, plugin }` descriptors, where `plugin` is a **class**, not an instance — `run()` instantiates every plugin fresh on each call (`new plugin()`), so separate app instances (different apps, or different test servers started from the same config) never share plugin state. Each instance is exposed on every `context`-type handler's `ContextProvider` under `name`, see [context-provider.md](./context-provider.md#plugins):

```js
class GreeterPlugin {
  greet(name) {
    return `hello, ${name}`;
  }
}

const handlerGreet = {
  route: '/greet/:name',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { name } = context.fetchRequest().params;
    context.provideReply({ message: context.greeter.greet(name) }).send();
  },
};

serverBased({
  title: 'ping service',
  purpose: 'http api',
  version: '1.0',
  handlers: [handlerGreet],
  plugins: [{ name: 'greeter', plugin: GreeterPlugin }],
}).run();
```

Throws `ServerBasedError` if two plugin descriptors share the same `name`, or if a descriptor is missing `name`/`plugin` (validated by `toPlugin`, see below).

A default plugin named `store` (a plain `Map`, see `lib/plugins/state-store.plugin.js`) is auto-appended when no `store`-named plugin is supplied — this is what backs `context.provideState`/`conductState` (see [context-provider.md](./context-provider.md#state-providestateconductstate)). Supply your own `{ name: 'store', plugin: MyStoreClass }` to override it.

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

serverBased({
  title: 'ping service',
  purpose: 'http api',
  version: '1.0',
  handlers: [handlerOriginPing],
}).run();
```

See `lib/server-based.test.js` ("server-based can register handlers with context or origin type") for a side-by-side `context` vs `origin` handler on the same server. Remember: only synchronous throws from an `origin` handler reach `runtimeErrorHandlingMiddleware` — an `async run(req, res)` that rejects is not caught.

See `example/todo-app`, `example/markdown-app`, `example/blog-app` for fuller usage (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling).

## Function registry (`configPath`)

`configPath` points `run()` at a `serverbased.json` file listing independently-authored "functions" — each shaped like a regular feature module (`{ handlers, middlewares?, plugins? }`, same as what `composeModules` consumes) — to be mounted alongside the app's own `handlers`. Loaded via `lib/function-registry-config.js` (`loadFunctionRegistryConfig`), a small module kept separate from `server-based.js` the same way `compose.js` is.

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
- `route` — mount prefix for that function's own routes: a handler registered at `GET /hello/:name` inside `greet.js` becomes reachable at `GET /greeter/hello/:name`.
- Each function gets its own `express.Router()`, its own fresh plugin instances (same instantiate-per-`run()` semantics as the app's own `plugins`), and its own middleware, applied only within that function's mount — isolated from the host app and from other functions. This includes the default `store` plugin: a function that doesn't declare its own `store`-named plugin gets one auto-appended, exactly like the host app's own `handlers` do — its own fresh `Map`, so `provideState`/`conductState` inside a function's handlers work unchanged, but never share state with the host's or another function's store. A function that needs another function's data calls that function's own route over HTTP rather than reaching into its store — see `example/time-tracking-app/functions/reports.js`.

Omitting `configPath` leaves `run()`'s behavior identical to before this feature existed.

### Failure/collision handling — fails fast at startup, same posture as `compose.js`'s duplicate-route check

- `configPath` given but the file doesn't exist, or `functions` is empty/absent — not an error: one `console.log` line, zero functions mounted, boot continues normally.
- A function entry missing `path` or `route`, a `path` that fails to `require`, or a function's own `handlers` containing a duplicate method+route — throws `FunctionRegistryError` (extends `ServerBasedError`) before `app.listen`.
- Two functions sharing the same `route`, or a function's `route` colliding with one of the host app's own handler routes — throws `ServerBasedError` before `app.listen`.

See `example/function-registry` for a full working example, and `lib/function-registry-config.test.js` for the loader's fail-fast cases.
