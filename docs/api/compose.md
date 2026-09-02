# Composing feature modules (`composeModules`, `lib/compose.js`)

← [index](./README.md) · see also [context-provider](./context-provider.md) (shared `stateStore`), [errors](./errors.md) (`ComposeError`)

A "module" here is just what `example/todo-app`, `example/blog-app`, and `example/markdown-app` already export: `{ handlers, middlewares }`. `composeModules` merges any number of them into a single pair suitable for `serverBased()`, so a running app can be extended with a new feature (e.g. adding an admin module to a blog) by writing that feature as its own module and composing it in, without touching the existing modules.

```js
const { serverBased } = require('./lib/server-based');
const { composeModules } = require('./lib/compose');
const todoApp = require('./example/todo-app');
const blogApp = require('./example/blog-app');

const { handlers, middlewares } = composeModules(todoApp, blogApp);

serverBased({
  title: 'combined app',
  purpose: 'todo + blog http api',
  version: '1.0',
  handlers,
  middlewares,
}).run();
```

## `composeModules(...modules)`

| param     | type              | notes |
|-----------|-------------------|-------|
| `modules` | `{ handlers?, middlewares? }[]` (rest args) | any number of modules; missing `handlers`/`middlewares` on a module default to `[]` |

Returns `{ handlers, middlewares }`:
- `handlers` — every module's handlers concatenated, in module order.
- `middlewares` — every module's global middlewares concatenated, in module order. These are **not scoped per module** — every middleware in the composed array runs for every route in the composed app, regardless of which module registered the route or the middleware.

Throws `ComposeError` (extends `ServerBasedError`) if two modules register the same `method` + `route` (method comparison is case-insensitive) — this fails at composition time, before `serverBased(...).run()` is even called.

## Things to watch when composing

- **Global middleware runs for everyone.** A middleware from one module (e.g. logging, auth) applies to every other composed module's routes too. Write global middlewares defensively — e.g. don't assume every response body in the app is a plain object (see `example/todo-app`'s logging middleware, which only tags plain-object bodies and passes anything else through untouched, precisely because composing it with `example/markdown-app`'s plain-text responses used to corrupt them).
- **`stateStore` is shared, unscoped, across composed modules.** `provideState`/`conductState` write to one `Map` per app instance (see [context-provider.md](./context-provider.md)); composing two modules that happen to use the same state key will silently clobber each other. Pick distinct key names across modules you intend to compose (`todo-app` uses `'todos'`, `blog-app` uses `'posts'`/`'views:<postId>'`).
- **Route collisions are exact-match on `method + route` strings.** `composeModules` does not detect an Express-level ambiguity like `/posts/:postId` vs `/posts/:id` on the same method — those are different strings to `composeModules`, but only the first one registered would ever actually match a request.

See `example/combined-2-apps` (todo + blog) and `example/combined-3-apps` (todo + blog + markdown) for full working examples, and `lib/compose.test.js` for unit tests of the merge/collision behavior.
