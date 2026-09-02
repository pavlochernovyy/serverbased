# Examples and tests

← [index](./README.md)

## Examples

- `example/todo-app` — full CRUD via `provideState`/`conductState` (seeded lazily with `seedTodos()`), demonstrates global middlewares (logging that rewrites `res.send` for object bodies only, a pass-through "verifying" middleware) and route params (`/todo/:todoId`). Exports `{ handlers, middlewares }` and only auto-runs when executed directly (`require.main === module`).
- `example/blog-app` — full CRUD via `provideState`/`conductState` (seeded lazily with `seedPosts()`), plus a per-post view counter under a separate state key (`views:<postId>`). Same export/auto-run pattern.
- `example/markdown-app` — single GET handler that renders markdown via `json2md` from query params, demonstrates per-handler middleware. Same export/auto-run pattern.
- `example/combined-2-apps` — composes `todo-app` + `blog-app` via `composeModules`, run as one server, to demonstrate extending a running app with another feature module without touching either module's own code.
- `example/combined-3-apps` — same idea, one more module (`todo-app` + `blog-app` + `markdown-app`), demonstrating that adding an Nth module costs nothing extra to wire up.

## Tests

- `server-based.test.js` — factory defaults, global middleware chaining, JSON/body/query round-trips, route params, per-handler middleware, side-by-side `context` vs `origin` handler types, and `provideState`/`conductState` sharing state across requests and handlers within one app instance.
- `error-handling.test.js` — `RuntimeError` thrown in a `context` handler (sync and async), a plain `Error` defaulting to 500, a malformed-JSON body caught as JSON, and a synchronous throw from an `origin`-type handler.
- `context.provider.test.js` — asserts `ContextProvider` methods are bound and chainable inside a running handler.
- `handler.test.js` — asserts `toHandler` normalizes and validates a handler config (via `createSampleHandler` from `test-fixtures.js`).
- `compose.test.js` — asserts `composeModules` merges handlers/middlewares in order, tolerates a module with no middlewares, treats the same route as distinct per HTTP method, and throws `ComposeError` on a duplicate method+route across modules.
- `example/todo-app/todo-app.test.js`, `example/blog-app/blog-app.test.js`, `example/markdown-app/markdown-app.test.js` — API-level tests per example app, real-server/`closeAsync()` pattern.
- `example/combined-2-apps/combined-2-apps.test.js` — asserts both composed apps' routes work off one server, and that one module's state writes don't affect the other's.
- `example/combined-3-apps/combined-3-apps.test.js` — same, across three composed modules including a plain-text (non-JSON) response from `markdown-app`, which exercises the `res.send` fix in `example/todo-app`.
- No test currently exercises a `HandlerError`/`ServerBasedError` being thrown during setup, or an async rejection from an `origin`-type handler (known unhandled gap, see [core.md](./core.md)).
