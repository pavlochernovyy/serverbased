# Parked: router-based mounting for `composeModules`

← [open-items](../state/open-items.md) · relates to [compose.md](../state/compose.md), [core.md](../state/core.md)

## The idea

Today `composeModules(...modules)` (`lib/compose.js`) flat-merges every module's `handlers` and
`middlewares` into one flat array/list, handed to `serverBased()` as if it were a single module.
Routes get their own collision check (`method + route` must be unique), but **middlewares don't** —
every module's `middlewares` end up global, applied to every route on the composed app, not just
that module's own routes.

The POC idea discussed: instead of flat-merging, mount each composed module on its own
`express.Router()` under a prefix, the same way the function registry already mounts each
function (see `core.md`, "Function registry"):

```js
app.use('/todo', todoRouter);   // todo-app's own handlers + middlewares
app.use('/blog', blogRouter);   // blog-app's own handlers + middlewares
```

## What this buys

- **Route namespacing "for free"** — a module's routes are automatically prefixed by its mount
  point, instead of requiring every module author to hand-prefix their own routes to avoid
  collisions.
- **Middleware scoping** — a module's `middlewares` would run only for requests hitting that
  module's own router, not globally. This directly fixes the sharp edge documented in
  `compose.md` (the `todo-app` logging middleware that used to corrupt `markdown-app`'s plain
  string response body, before being patched to only touch plain-object bodies).

## Why it was postponed

- It's a bigger structural change than it first looks: today's flat merge means every consumer
  of `composeModules` gets one single `{ handlers, middlewares, plugins }` object, with routes
  addressable exactly as authored (no implicit prefix). Moving to per-module routers changes the
  addressable URL of every route in every existing example/app unless callers explicitly opt in
  to a mount prefix per module — a breaking change to route shape, not just an internal
  refactor.
- The function registry (`configPath` / `lib/function-registry-config.js`) already needed
  exactly this per-router mounting mechanism and shipped it first, for a narrower surface
  (functions loaded from `serverbased.json`, not modules passed to `composeModules` directly).
  That gives a working, tested implementation of "mount at a prefix, scope plugins/routes to it"
  to copy from — see `registerHandlers(router, handlers, pluginInstances)` in
  `lib/server-based.js`, factored out specifically so the top-level app and each function's
  router share the same context-injection wiring.
- Decision at the time: don't design the general `composeModules` version until it's clear
  whether callers actually want/need a mount prefix on statically-composed modules (as opposed
  to config-loaded functions, where a `route` per entry was already a natural, required field).

## Shape of a solution (sketch, not decided)

Borrowing directly from the function-registry pattern:

1. Each module passed to `composeModules` gains an optional `route` (mount prefix), similar to a
   function-registry entry's `route`. Omitting it could either (a) default to flat-merge
   behavior (today's behavior, fully backward compatible), or (b) require every module to
   declare one once this mode is opted into — needs a decision.
2. `composeModules` would build one `express.Router()` per module with a `route`, register that
   module's `handlers` on it via the same `registerHandlers` helper `function-registry-config.js`
   already uses, and apply that module's `middlewares` only to its own router (`router.use(...)`
   instead of `app.use(...)` globally).
3. Modules without a `route` (if (a) above) keep today's flat-merge path, so this can ship
   additively without breaking `example/todo-app`, `example/blog-app`, `example/markdown-app`,
   `example/mini-store`, or `example/combined-mini-store-blog`.
4. Route-collision and plugin-name-collision checks stay, same fail-fast posture — collisions
   would need to account for both flat-merged and router-mounted modules coexisting.

## Open questions before this gets picked up

- Does every module need a `route` once this mode exists, or can flat-merge and router-mounted
  modules coexist in the same `composeModules(...)` call?
- Does per-module router mounting want to fully replace the flat merge eventually, or stay an
  opt-in alternate mode indefinitely?
- How does this interact with the [per-module middleware isolation](./per-module-middleware-isolation.md)
  parked item — they're largely the same fix, viewed from two angles (namespacing vs. isolation).
