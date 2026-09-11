### Task state: Implemented

Execution history (dated resolutions, migrations, follow-ups) lives in a separate log file:
[`config-only-composition.task.log.md`](./config-only-composition.task.log.md). This file is the
design/decisions doc only — *what was decided and why*, not *a chronological record of every step
taken to get there*.

Goal: collapse `server-based`'s two composition models (`composeModules` flat-merge, and the
`configPath` function registry) into one — config-driven, function-registry-only. Every app
becomes a `serverbased.json` + `functions/*.js` layout (the shape `example/time-tracking-app`
already proved out), mounted by the framework, communicating with each other over HTTP rather
than in-process `require`. No standalone `serverBased({ handlers, middlewares, plugins }).run()`
usage remains; `composeModules`/`compose.js` is removed, not deprecated.

Source of this direction: comment thread the author left in `lib/server-based.js` (around the
`for (const middleware of middlewares)` loop) while diagnosing the middleware-global-application
problem — see [`park/per-module-middleware-isolation.md`](../park/per-module-middleware-isolation.md)
for the bug that triggered the realization. Reproduced here as the origin of decision 1 below:

> I propose to reduce our framework to the way it operates just functions by own logic based on
> config provided. As a developer to the framework, we simply update an api to serverbased.json
> structure with optional fields added in future. External users would appreciate such
> simplification (as no typings would be needed). Update example apps, so we use common approach
> to them as we use to /time-tracking-app where /functions folder is a good practise to have,
> with serverbased.json and corresponding test file in the project's root.

## Decisions locked in

1. **Config-only composition.** `serverBased(...)` stops accepting `handlers`/`middlewares`/
   `plugins` as top-level fields. The only way to register routes is via `configPath` →
   `serverbased.json` → one or more `functions` entries, each shaped like today's function module
   (`{ handlers, middlewares?, plugins? }`). This resolves the middleware-scoping and route-
   namespacing gaps documented in [`park/router-based-mounting.md`](../park/router-based-mounting.md)
   and [`park/per-module-middleware-isolation.md`](../park/per-module-middleware-isolation.md) as a
   side effect — no separate fix needed, since every function already gets its own
   `express.Router()`.
2. **`composeModules` is deleted, not kept.** `lib/compose.js`, `lib/compose.test.js`,
   `docs/state/compose.md`, `docs/api/compose.md`, and `ComposeError` all go away outright — no
   legacy path, no re-export shim. Anything `composeModules` did (route/plugin-name collision
   checks across modules) is already covered by `function-registry-config.js`'s existing
   fail-fast checks across functions.
3. **Cross-function *data* access goes over HTTP; a function's *own* plugins stay in-process via
   context.** These are two different things — worth stating precisely, once [Phase 0 in the
   log](./config-only-composition.task.log.md#phase-0--verified-functions-can-already-provide-their-own-plugins-via-context)
   proved the plugin path actually works:
   - A function that needs *another* function's (or the app's) data reads it through that
     owner's own public route — the pattern `example/time-tracking-app/functions/reports.js`
     already establishes for `/reports/summary` calling `/entries`. No module ever `require`s
     another module's internals for data access — this also removes the module-cycling risk the
     author's comment flags. **Deliberately HTTP-only, not a limitation to lift later**: bringing
     another function's data into this function's context risks a middleware here silently
     mutating or reshaping it in ways that are hard to trace back to the source; an HTTP call is
     an explicit, independently loggable action instead. Revisit only if a concrete need for a
     lower-latency in-process path shows up — not planned as a near-term follow-up.
   - A function's **own** plugin (e.g. its own `store`, or a custom one like `CartPlugin`) is
     still injected onto `context.<name>` in-process, exactly like `serverBased()`'s top-level
     `plugins` used to. The plugin's own methods are free to reach out over HTTP internally if
     the work they do needs another function's data, keeping that boundary explicit and loggable
     at the point it actually crosses functions, rather than the framework silently handing one
     function's raw state to another's context.
4. **Every example gets the `time-tracking-app` shape**: `serverbased.json` at the app root,
   route handlers/plugins/middlewares live in `functions/<name>.js` files, `index.js` is a thin
   entrypoint that does `serverBased({ title, purpose, version, configPath }).run()` and nothing
   else, and one test file at the app root (`<app-name>.test.js`) drives the whole app through
   HTTP the way `time-tracking-app.test.js` already does.
5. **No dead code or legacy docs survive the migration.** Every doc mentioning `composeModules`,
   standalone `handlers`/`middlewares`/`plugins` usage, or the now-collapsed `example/combined-*`
   apps gets rewritten or removed in the same pass — not flagged "legacy" and left in place.

## Solution draft

### `lib/server-based.js`

- `serverBased({ title, purpose, version, runningPort?, configPath })` — drop `handlers`,
  `middlewares`, `plugins` from the accepted config entirely. `configPath` becomes **required**
  (was optional) — `serverBased(...)` throws a `ServerBasedError` if it's missing, the same
  fail-fast posture as the existing `title`/`purpose`/`version` checks.
- `run()` no longer does its own top-level `resolvedHandlers`/`assertNoDuplicateRoutes`/
  `registerHandlers(app, ...)` pass, nor its own top-level `plugins`/`pluginDescriptors` pass, nor
  a top-level `for (const middleware of middlewares) app.use(middleware)` loop (the exact block
  the author's comment lived in) — all routing/middleware/plugin wiring becomes the function loop
  that already existed for `configPath`, unconditionally. Every app has at least one function;
  there is no separate "host app" tier.
- `registerHandlers(router, handlers, pluginInstances)` (the shared helper) is unchanged — it
  already worked per-router, which is exactly what this collapses onto exclusively.
- `traceServerBasedMetaData` keeps logging `title`/`purpose`/`version`, drops the `handlers` line
  (no top-level `handlers` array to log any more — logging shifts to a single "N functions
  mounted" summary line instead).

### `lib/function-registry-config.js`

- Functionally unchanged — it already did exactly what's needed (`{ path, route }` entries,
  fail-fast on bad shape/missing file/duplicate route, isolated plugin instances). No design
  changes here, just became load-bearing for 100% of routing instead of an additive extra.
- **Resolved (open question #1)**: no root-mount (`"/"`/`""`) special case. Every function's own
  handler routes stay self-contained (e.g. `todo-app` keeps `/todo`, `/todo/:todoId`), and the
  function's `route` in `serverbased.json` is always an explicit, deliberate prefix — same as
  `cart`/`greeter`/`projects`/`reports` already work. The loader's existing truthy-`route`
  requirement stays as-is.

### `lib/compose.js`, `lib/compose.test.js`

- Deleted outright (decision 2).

### Examples — migration shape per app

Every `example/*` app converts to:

```
example/<app-name>/
  serverbased.json
  functions/
    <function-name>.js      # one or more, each { handlers, middlewares?, plugins? }
  index.js                  # serverBased({ title, purpose, version, configPath }).run()
  <app-name>.test.js         # exercises the app over HTTP, same style as time-tracking-app.test.js
```

Decided fate per example (execution details in the log):

- `example/todo-app`, `example/blog-app` → single-function shape, each with a custom `store`
  plugin seeding its own starting state.
- `example/markdown-app` → single-function shape.
- `example/mini-store` (renamed `mini-store-app`) → split into `cart`/`sale` functions rather than
  kept as one, per decision 3 (`sale` reads `cart`'s data over HTTP).
- `example/combined-2-apps`, `example/combined-3-apps`, `example/combined-mini-store-blog` →
  **removed**. Their entire purpose was demonstrating `composeModules`, which no longer exists.
  What they demonstrated (multiple feature modules under one running server) is now just... every
  app, by default, since every app is `serverbased.json` + N functions.
- `example/function-registry` (renamed `hello-world-app`) → kept as the canonical function-
  registry/plugin-override demo, renamed since "function registry" is no longer a special/
  additive mode — it's just how `server-based` works.
- `example/time-tracking-app` → already the target shape; its top-level `/entries` handlers moved
  into their own function too, for consistency.

### Docs

- `docs/state/compose.md`, `docs/api/compose.md` — deleted; rows removed from `docs/README.md`'s
  `state/` and `api/` sections tables.
- `docs/state/core.md` — rewritten: "Core factory" drops the standalone-handlers description;
  "Plugin system" drops the top-level-`plugins`-auto-append description in favor of the
  function-level one; "Function registry" stops being a named sub-feature and becomes just "how
  routing works" — no longer needs "additive, not a mode switch" framing since there's only one
  mode.
- `docs/state/examples-and-tests.md` — rewritten to describe the new per-app shape and drop the
  `combined-*`/old `function-registry` example rows.
- `docs/state/open-items.md` — the "Function registry" entry stops being a discrete open item
  (it's just core behavior now); [`park/router-based-mounting.md`](../park/router-based-mounting.md)
  and [`park/per-module-middleware-isolation.md`](../park/per-module-middleware-isolation.md) both
  get closed out — resolved as a side effect of this change, not "parked" anymore. Their files
  note the resolution rather than being silently deleted (keeps the design-conversation trail
  intact, matching how `function-registry.task.md` records the superseded live-watch direction).
- `docs/api/server-based.md` — rewritten `serverBased(config)` signature (drop `handlers`/
  `middlewares`/`plugins`, `configPath` now required), rewritten minimal example.
- `docs/README.md` — sections tables for both `state/` and `api/` drop the `compose.md` rows.

### Tests

- `lib/compose.test.js` — deleted.
- `lib/server-based.test.js` — rewritten for the new required-`configPath`, no-top-level-
  `handlers` signature; every case exercising standalone `handlers`/`middlewares`/`plugins` moved
  to exercise the same thing through a `configPath` fixture instead (`writeFunctionConfig`,
  `lib/test-fixtures.js`).
- Every `example/*.test.js` for a migrated app — rewritten to spin up the app via its (unchanged
  call shape) `index.js`/`serverBased({ configPath }).run()` and hit it over HTTP, same style
  `time-tracking-app.test.js` already used. `combined-2-apps.test.js`, `combined-3-apps.test.js`,
  `combined-mini-store-blog.test.js` deleted along with their examples;
  `function-registry.test.js` renamed to `hello-world-app.test.js` and kept.

## Explicitly out of scope for this increment

- No change to `lib/context.provider.js`, `lib/plugins/state-store.plugin.js`, handler/plugin
  validation (`toHandler`/`toPlugin`), or error classes beyond removing `ComposeError`.
- No live filesystem watching or runtime function enable/disable — config stays static, read
  once at startup, same as today's function registry.
- No change to the isolated-default-store-per-function behavior — already decided and working.
- Factory validations for consumed/provided data structures (the other currently-open item in
  `open-items.md`) — separate piece of work, not bundled into this migration.

## Open questions

1. **Root-mount route.** Does a function's `route` accept `"/"` (or `""`) to mean "no prefix,
   mount at the app's own root" — needed to keep `todo-app`-style apps' URLs identical after
   migration? Or should every migrated app's routes get a real prefix (e.g. `todo-app`'s function
   mounts at `/todo`, and its own handlers drop the now-redundant `/todo` prefix they declare
   today) — a URL-shape change, but arguably cleaner (prefix lives in one place, the config, not
   duplicated in the function's own route strings)?
2. **Fate of `example/combined-2-apps`, `combined-3-apps`, `combined-mini-store-blog`,
   `function-registry`.** Deleted outright (nothing left to uniquely demonstrate once this is the
   only mode), or is there something in `function-registry`'s example specifically worth folding
   into `time-tracking-app` or a renamed canonical multi-function example before deleting it?
3. **`mini-store`'s `CartPlugin`/`SalePlugin`** — one function (as today) or split into two
   functions to demonstrate function-level plugin isolation in an example, now that the framework
   makes that the default shape everywhere? Affects whether `sale.plugin.js`'s use of `cart`
   (if any) has to move to an HTTP call per decision 3 above.
4. **Order of execution** — one big cutover commit/PR, or staged (e.g. land the `server-based.js`
   API change + delete `compose.js` first, then migrate examples app-by-app)? Given "no legacy
   code" is a hard requirement, a staged approach would need the old and new `serverBased(...)`
   signatures to coexist temporarily, which decision 5 rules out — leaning toward one cutover,
   confirming here before starting.
5. **`runningMode`/`routerEngine` enums** — still declared in `defaults` but unused by `run()`
   even before this change (see `state/core.md`). Does this migration finally remove them (dead
   config surface, arguably more dead than `composeModules` was), or stay out of scope and get
   tracked separately?

## Answers to open questions

> Regarding point #1: Provide simpler explanation, I can not understand why do we need "/" route if we specifically assign functions per route in serverbased.json file;
> Regarding point #2: Delete those apps named as "combined...";
> Add "/function-registry/functions/plugins/" folder, place CartPlugin within, require it in cart.js function, make sure tests are green;
> Regarding point #3: Split into multi functions following same folders convention as to "function-registry" sample, Use http in function, which needs to get data from the outside function's plugin;
> Regarding point #4: no need to perform any actions, as I monitor the process, and do commit the changes with necessary steps after (we will do the steps one by one, not the whole migration at once);
> Regarding point #5: remove `runningMode` and `routerEngine` options from the serverbased api as well as update tests correspondingly;

Full resolution detail for each point (what was actually done, dated) is in the log:
[`config-only-composition.task.log.md`](./config-only-composition.task.log.md#open-question-resolutions).

## Status

All five decisions above are implemented, all five open questions are resolved, and every
`example/*` app is migrated. See the log for the complete dated trail:
[`config-only-composition.task.log.md`](./config-only-composition.task.log.md).
