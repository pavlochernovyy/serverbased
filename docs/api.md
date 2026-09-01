# server-based — API reference

`server-based` turns a declarative config object into a running Express server.
Source: `lib/server-based.js`, `lib/context.provider.js`.

```js
const { serverBased } = require('./lib/server-based');

serverBased({ title, purpose, version, handlers: [...] }).run();
```

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
| `handlers`       | `array`    | no       | `{}`                    | array of handler configs, see below |
| `middlewares`    | `array`    | no       | `[]`                    | array of Express middleware functions `(req, res, next) => void`, applied globally in order, before any handler |

### return value

An object exposing the resolved config plus:

- `run()` — starts the Express server. Returns a `Promise<http.Server>` that resolves once the server is listening. The resolved server has:
  - `closeAsync()` — `Promise<void>`, wraps `server.close()`, added for convenient teardown (used throughout the test suite).

Also logs a metadata block (`title`, `purpose`, `version`, `handlers`) to console on `run()`, and one line per incoming request (`"<method> <route> invoked"`).

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

- **`'context'`** — `run` is called as `run(context)` (async allowed). `context` is a `ContextProvider` instance wrapping the current `req`/`res` (see below). Errors thrown or rejected inside `run` are passed to `next(error)`, which reaches `runtimeErrorHandlingMiddleware` (see Errors below).
- **`'origin'`** — `run` is called as `run(req, res)` with the raw Express request/response. No wrapping. Synchronous throws are still caught by Express itself and reach `runtimeErrorHandlingMiddleware`; a **rejected promise from an `async run` is not awaited or caught** — it is not routed to the error middleware (deliberate scope call: error-handling safety currently targets the `context` path only, see `docs/current-process.txt`).

## `ContextProvider` (`lib/context.provider.js`)

Instantiated per-request for `handlerType: 'context'` handlers, passed as the `context` argument.

| method                          | returns             | description |
|----------------------------------|---------------------|--------------|
| `fetchRequest()`                 | Express `req`       | raw request object — use for `.body`, `.query`, `.params`, `.headers`, etc. |
| `fetchParamsInt(scopeToInt?)`    | `object`             | route params (`req.params`); if `scopeToInt` (array of key names) is given, those keys are parsed with `parseInt(value, 10)`, all other keys passed through as strings. Omit `scopeToInt` to get raw string params |
| `provideReply(data)`             | `this` (chainable)   | stages `data` as the reply payload |
| `send()`                         | `void`               | sends the staged reply via `res.send()`, default status `200` |
| `sendWithCode(code)`             | `void`               | sends the staged reply via `res.status(code).send()` |
| `provideState(key, value)`       | `this` (chainable)   | writes `value` under `key` into the app's shared `stateStore` (a `Map`) |
| `conductState(key)`              | `any`                | reads `value` back for `key` from the shared `stateStore`; `undefined` if never set |

Typical handler:

```js
run(context) {
  const { postId } = context.fetchRequest().params;
  const post = storage.posts.get(postId);
  if (!post) {
    context.provideReply({ message: 'not found' }).sendWithCode(404);
    return;
  }
  context.provideReply({ data: post }).send();
}
```

### State (`provideState`/`conductState`)

`serverBased.run()` creates one `stateStore` (a plain `Map`) per app instance and passes it into every `context`-type handler's `ContextProvider` (see `stateStore` in `server-based.js`). This makes `provideState`/`conductState` a lightweight, app-scoped key/value store, shared by every handler and every request of that app instance — but isolated from any other `serverBased()` instance (e.g. different apps, or different test servers).

There's no built-in seeding — reading a key that was never set returns `undefined`, so handlers typically seed lazily on first access:

```js
const seedPosts = () => new Map([['1', { title: 'first post' }]]);

run(context) {
  const posts = context.conductState('posts') || seedPosts();
  context.provideState('posts', posts);

  context.provideReply({ data: Object.fromEntries(posts) }).send();
}
```

It's a generic in-memory scratch store, not a persistence layer — nothing survives a process restart. See `example/blog-app` (post storage plus a per-post view counter) and `example/todo-app` for it in use, and `lib/server-based.test.js` ("shares provideState/conductState across requests and handlers") for a minimal, storage-free demonstration.

## Errors

| class            | extends            | thrown when |
|-------------------|--------------------|-------------|
| `ServerBasedError` | `Error`            | missing `title`/`purpose`/`version`, or unsupported `networkProtocol` |
| `HandlerError`      | `ServerBasedError` | missing `route`/`method`/`run`/`handlerType` on a handler config |
| `RuntimeError`      | `ServerBasedError` | not thrown internally — a convenience class for handlers to throw with an explicit `statusCode` (default `500`), e.g. `throw new RuntimeError('post not found', 404)` |

`serverBased`, `toHandler`, `defaults`, `ServerBasedError`, `HandlerError`, `RuntimeError` are all exported from `lib/server-based.js`.

`ServerBasedError`/`HandlerError` are only thrown during config/handler setup (synchronously, before `run()` starts listening).

### `runtimeErrorHandlingMiddleware`

Registered via `app.use(runtimeErrorHandlingMiddleware)` after all handlers, as the last middleware in the chain — Express's standard error-handling middleware signature `(err, req, res, next)`. Any error passed to `next(error)` (including body-parser failures like malformed JSON, and errors thrown/rejected inside `context`-type handlers) is caught here:

- if `res.headersSent`, delegates to Express's default handler via `next(err)`.
- logs `"<method> <url> failed:"` plus the error via `console.info`.
- responds with `res.status(err.statusCode || 500).send({ message, name })`, where `message` falls back to `'internal server error'` and `name` falls back to `RuntimeError.name`.

Not exported — internal to `serverBased.run()`. `RuntimeError`'s `statusCode`/`name` fields flow straight through to the response; a plain `Error` yields `{ statusCode: 500, name: 'Error' }` since neither field exists on it beyond the built-in `.name`.

Runtime errors from `origin`-type handlers reach this middleware only for **synchronous** throws (Express's own behavior) — async rejections from `origin` handlers are not routed here (see `handlerType` note above).

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

See `lib/server-based.test.js` ("server-based can register handlers with context or origin type") for a side-by-side `context` vs `origin` handler on the same server. Remember: only synchronous throws from an `origin` handler reach `runtimeErrorHandlingMiddleware` (see `handlerType` above) — an `async run(req, res)` that rejects is not caught.

See `example/todo-app`, `example/markdown-app`, `example/blog-app` for fuller usage (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling).
