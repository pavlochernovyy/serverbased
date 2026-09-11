# Parked: per-module middleware isolation

← [open-items](../state/open-items.md) · relates to [compose.md](../state/compose.md), [core.md](../state/core.md), [router-based-mounting.md](./router-based-mounting.md)

## Current situation

`composeModules` (`lib/compose.js`) concatenates every module's `middlewares` array in module
order and hands the combined array to `serverBased()`, which applies it globally
(`app.use(middleware)` for each, in `run()`). There is no scoping: a middleware declared by one
module runs for **every** route in the composed app, including routes owned by other modules.

This already caused one real bug (documented in `compose.md`): `todo-app`'s logging middleware
unconditionally spread the response body (`{ ...body, logs: 'submitted' }`), which corrupted
`markdown-app`'s plain-string response when the two were composed together. It was fixed by
making the middleware defensive (only touch plain-object bodies), not by scoping the middleware
itself — the underlying global-application behavior is unchanged.

## Is this actually a bad situation, given routes/plugins are already isolated?

Partial isolation exists today, but it doesn't cover middleware:

- **Routes** are isolated — duplicate `method + route` across modules throws `ComposeError` at
  compose time. No two modules can claim the same route.
- **Plugins/state** are isolated — duplicate plugin `name` across modules throws `ComposeError`;
  each module's plugin instances are separate, and (per the function registry) each function's
  default `store` is a fresh, unshared `Map`.
- **Middleware is not isolated** — it's the one piece of the module shape (`{ handlers,
  middlewares, plugins }`) that still behaves as shared/global rather than module-scoped.

So the isolation story is inconsistent: two modules can't collide on a route or a plugin name,
but one module's middleware silently touches every other module's requests/responses. That's a
real asymmetry, not just a theoretical gap — it already produced the `todo-app`/`markdown-app`
bug. The risk class is: any middleware that mutates `req`/`res` based on assumptions that hold
for its own module's routes (response shape, expected headers, expected body fields) but not
for a sibling module's routes.

Whether this rises to "bad" depends on what middlewares end up doing in practice:

- If middlewares stay narrow and defensive (check shape before mutating, as `todo-app`'s fix
  now does), the global-application behavior is a latent footgun but not an active problem.
- If middleware usage grows (auth checks, rate limiting, request logging with side effects,
  anything module-specific), the lack of scoping becomes a correctness risk on every new
  composition, not just an edge case — each new middleware has to be audited against every
  other composed module's routes, which doesn't scale past a couple of modules.

## Why parked rather than fixed now

The natural fix is the same mechanism as [router-based mounting](./router-based-mounting.md):
mounting each module on its own `express.Router()` would scope both routes *and* middleware to
that router automatically (`router.use(middleware)` instead of `app.use(middleware)`). Doing
this in isolation, without the router-mounting change, means inventing a separate scoping
mechanism that would likely be thrown away once router-mounting lands — so it's parked alongside
that item rather than solved independently.

## Verdict for now

Not an active bug today (no known other collisions beyond the fixed `todo-app` case), but a real
structural gap worth tracking rather than dismissing — revisit together with router-based
mounting, since that change would resolve both at once.


## Questions on after review

**"I can not understand where do we use todoapp and markdown context together, why do they
collide? Show me the code sample here."**

They're composed together in `example/combined-3-apps/index.js`:

```js
const todoApp = require('../todo-app');
const blogApp = require('../blog-app');
const markdownApp = require('../markdown-app');

const { handlers, middlewares } = composeModules(todoApp, blogApp, markdownApp);

serverBased({ title: 'combined 3-apps (todo + blog + markdown)', middlewares, handlers }).run();
```

(`example/combined-2-apps/index.js` does the same for just `todoApp` + `blogApp` — the collision
only needs `todo-app` and *any* module whose route returns a non-plain-object body, `markdown-app`
being the one that actually has one.)

`composeModules` concatenates `middlewares` from every module into one flat array (see
`compose.md`), and `serverBased()`'s `run()` applies that whole array globally via `app.use(...)`
— there is no per-module `app.use(prefix, moduleMiddleware)`. So `todo-app`'s own
`loggingMiddleware` (`example/todo-app/index.js`) ends up wrapping `res.send` for **every**
request handled by the composed app, not just `/todo/*` requests:

```js
// example/todo-app/index.js — loggingMiddleware.run
const originalSend = res.send;
res.send = (body) => {
  const isPlainObject = body !== null && typeof body === 'object' && !Array.isArray(body);
  const data = isPlainObject ? { ...body, logs: 'submitted' } : body;   // <- the fix
  res.send = originalSend;
  return res.send(data);
};
next();
```

Before the `isPlainObject` guard was added, this middleware unconditionally did
`{ ...body, logs: 'submitted' }` on whatever `res.send(body)` received. `markdown-app`'s handler
calls `res.send(markdownString)` — a plain string. Spreading a string produces a character-indexed
object (`{ '0': 'm', '1': 'a', ... }`), not the markdown text — that's the corruption. It happened
specifically because `todo-app`'s middleware runs on `markdown-app`'s routes too, purely as a side
effect of both modules' `middlewares` arrays being flattened into one global list by
`composeModules` + applied globally by `run()`. The comment block left in that file
(`example/todo-app/index.js`, right above `loggingMiddleware`) is the author working through this
exact realization in real time — "why the middleware to app1 should have access to the http
context for app1... since we register same handlers and same middlewares?".

The current fix (the `isPlainObject` check) makes the middleware defensive so it no longer
mangles non-object bodies — but it still *runs* on every module's routes; it just no longer
does damage when it does. That's the gap this parked item is about: middleware isolation isn't
solved, just worked around at the one call site that already got bitten.
