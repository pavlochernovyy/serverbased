# Errors

← [index](./README.md) · see also [server-based](./server-based.md), [compose](./compose.md) (`ComposeError`)

| class            | extends            | thrown when |
|-------------------|--------------------|-------------|
| `ServerBasedError` | `Error`            | missing `title`/`purpose`/`version`/`configPath` on `serverBased(config)`, unsupported `networkProtocol`, or missing `name`/`plugin` on a plugin descriptor (via `toPlugin`, thrown while a function's own `plugins` are validated) |
| `HandlerError`      | `ServerBasedError` | missing `route`/`method`/`run`/`handlerType` on a handler config |
| `RuntimeError`      | `ServerBasedError` | not thrown internally — a convenience class for handlers to throw with an explicit `statusCode` (default `500`), e.g. `throw new RuntimeError('post not found', 404)` |
| `ComposeError`      | `ServerBasedError` | two modules passed to `composeModules` register the same `method` + `route`, or the same plugin `name` — see [compose.md](./compose.md) |
| `FunctionRegistryError` | `ServerBasedError` | a `serverbased.json` function entry is missing `path`/`route`, its `path` fails to `require`, two functions share a `route`, a duplicate plugin `name` within one function's own `plugins`, or a duplicate `method`+`route` within one function's own `handlers` — see [server-based.md#function-registry-configpath](./server-based.md#function-registry-configpath). This is now where every route/plugin-name collision check lives, since `configPath` is the only way to register routes |

`serverBased`, `toHandler`, `toPlugin`, `assertNoDuplicateRoutes`, `defaults`, `ServerBasedError`, `HandlerError`, `RuntimeError`, `fetchJson` are all exported from `lib/server-based.js`. `composeModules`, `ComposeError` are exported from `lib/compose.js`. `loadFunctionRegistryConfig`, `FunctionRegistryError` are exported from `lib/function-registry-config.js`.

`ServerBasedError`/`HandlerError`/`FunctionRegistryError`/`ComposeError` are only thrown during config/handler/composition setup (synchronously, before `run()` starts listening). Note the exact timing differs slightly: `title`/`purpose`/`version`/`configPath`/`networkProtocol` are validated when `serverBased(config)` is called; each function's own `handlers` (`toHandler`)/`plugins` (`toPlugin`, plus route- and plugin-name-duplicate checks) are validated inside `loadFunctionRegistryConfig`, called from `run()` — still before the server starts listening but one call later than the others.

## `runtimeErrorHandlingMiddleware`

Registered via `app.use(runtimeErrorHandlingMiddleware)` after all handlers, as the last middleware in the chain — Express's standard error-handling middleware signature `(err, req, res, next)`. Any error passed to `next(error)` (including body-parser failures like malformed JSON, and errors thrown/rejected inside `context`-type handlers) is caught here:

- if `res.headersSent`, delegates to Express's default handler via `next(err)`.
- logs `"<method> <url> failed:"` plus the error via `console.info`.
- responds with `res.status(err.statusCode || 500).send({ message, name })`, where `message` falls back to `'internal server error'` and `name` falls back to `RuntimeError.name`.

Not exported — internal to `serverBased.run()`. `RuntimeError`'s `statusCode`/`name` fields flow straight through to the response; a plain `Error` yields `{ statusCode: 500, name: 'Error' }` since neither field exists on it beyond the built-in `.name`.

Runtime errors from `origin`-type handlers reach this middleware only for **synchronous** throws (Express's own behavior) — async rejections from `origin` handlers are not routed here (see [server-based.md](./server-based.md) `handlerType` note).
