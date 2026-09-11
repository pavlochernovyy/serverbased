Goal: collapse `server-based`'s two composition models (`composeModules` flat-merge, and the
`configPath` function registry) into one — config-driven, function-registry-only. Every app
becomes a `serverbased.json` + `functions/*.js` layout (the shape `example/time-tracking-app`
already proves out), mounted by the framework, communicating with each other over HTTP rather
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
   context.** These are two different things — worth stating precisely after Phase 0 below proved
   the plugin path actually works:
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
     `plugins` do today — see Phase 0 below. The plugin's own methods are free to reach out over
     HTTP internally if the work they do needs another function's data, keeping that boundary
     explicit and loggable at the point it actually crosses functions, rather than the framework
     silently handing one function's raw state to another's context.
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
  (currently optional) — `serverBased(...)` throws a `ServerBasedError` if it's missing, the same
  fail-fast posture as the existing `title`/`purpose`/`version` checks.
- `run()` no longer does its own top-level `resolvedHandlers`/`assertNoDuplicateRoutes`/
  `registerHandlers(app, ...)` pass, nor its own top-level `plugins`/`pluginDescriptors` pass, nor
  the `for (const middleware of middlewares) app.use(middleware)` loop (the exact block the
  author's comment lives in today) — all routing/middleware/plugin wiring becomes the function
  loop that already exists (lines 279-303 today), unconditionally. Every app has at least one
  function; there is no separate "host app" tier anymore.
- `registerHandlers(router, handlers, pluginInstances)` (the shared helper) is unchanged — it
  already works per-router, which is exactly what this collapses onto exclusively.
- `traceServerBasedMetaData` keeps logging `title`/`purpose`/`version`, drops the `handlers` line
  (there's no top-level `handlers` array to log anymore — logging shifts to per-function, inside
  the function loop, or stays a single "N functions mounted" summary line).

### `lib/function-registry-config.js`

- Functionally unchanged — it already does exactly what's needed (`{ path, route }` entries,
  fail-fast on bad shape/missing file/duplicate route, isolated plugin instances). No design
  changes expected here, just becomes load-bearing for 100% of routing instead of an additive
  extra.
- **Resolved (see Open question #1 below)**: no root-mount (`"/"`/`""`) special case. Every
  function's own handler routes stay self-contained (e.g. `todo-app` keeps `/todo`,
  `/todo/:todoId`), and the function's `route` in `serverbased.json` is always an explicit,
  deliberate prefix — same as `cart`/`greeter`/`projects`/`reports` already work. The loader's
  existing truthy-`route` requirement stays as-is.

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

Concrete mapping for today's examples (draft — to confirm per-app in follow-up, not decided here):

- `example/todo-app` → single function `functions/todo.js` (today's `handlers`/`middlewares`
  moved as-is), `serverbased.json` with one entry. **Not yet migrated.**
- `example/blog-app` → same single-function shape. **Not yet migrated.**
- `example/markdown-app` → **done (2026-09-11)** — single function `functions/quote.js`, mounted
  at `/quote` via `serverbased.json`, handler's own route is `/` (mount point is the whole
  meaningful path, same convention `functions/projects.js` uses). See Migration log below.
- `example/mini-store` → **done (2026-09-11)** — split into `cart`/`sale` functions rather than
  kept as one, per point #3's resolution above (see "Resolution — point #3" below).
- `example/combined-2-apps`, `example/combined-3-apps` → **removed**. Their entire purpose was
  demonstrating `composeModules`, which no longer exists. What they demonstrated (multiple
  feature modules under one running server) is now just... every app, by default, since every
  app is `serverbased.json` + N functions. No replacement example needed unless a multi-function
  single-app demo (beyond `time-tracking-app`) is wanted for its own reason.
- `example/combined-mini-store-blog` → same as above — removed, superseded by the default
  function-registry shape (an app with a `mini-store` function and a `blog` function listed in
  one `serverbased.json` *is* this example, without a special name for it).
- `example/function-registry` → likely removed or renamed/merged, since "function registry" is
  no longer a special/additive mode — it's just how `server-based` works. Whatever it uniquely
  demonstrated today should be folded into the remaining canonical example(s) instead of kept as
  a separately-named example for a mode that no longer has an alternative.
- `example/time-tracking-app` → unchanged; it's already the target shape.

### Docs

- `docs/state/compose.md`, `docs/api/compose.md` — deleted; remove their rows from
  `docs/README.md`'s `state/` and `api/` sections tables.
- `docs/state/core.md` — rewritten: "Core factory" section drops the standalone-handlers
  description; "Plugin system" section drops the top-level-`plugins`-auto-append description in
  favor of the function-level one (already documented); "Function registry" section stops being
  a named sub-feature and becomes just "how routing works," folded into the top no
  longer needs "additive, not a mode switch" framing since there's only one mode.
- `docs/state/examples-and-tests.md` — rewritten to describe the new per-app shape and drop the
  `combined-*`/`function-registry` example rows.
- `docs/state/open-items.md` — the "Function registry" entry stops being a discrete open item
  (it's just core behavior now); [`park/router-based-mounting.md`](../park/router-based-mounting.md)
  and [`park/per-module-middleware-isolation.md`](../park/per-module-middleware-isolation.md) both
  get closed out — resolved as a side effect of this change, not "parked" anymore. Their files
  should note the resolution rather than being silently deleted (keeps the design-conversation
  trail intact, matching how `function-registry.task.md` records the superseded live-watch
  direction).
- `docs/api/server-based.md` — rewritten `serverBased(config)` signature (drop `handlers`/
  `middlewares`/`plugins`, `configPath` now required), rewritten minimal example.
- `docs/README.md` — sections tables for both `state/` and `api/` drop the `compose.md` rows.

### Tests

- `lib/compose.test.js` — deleted.
- `lib/server-based.test.js` — rewritten for the new required-`configPath`, no-top-level-
  `handlers` signature; any case currently exercising standalone `handlers`/`middlewares`/
  `plugins` moves to exercise the same thing through a `configPath` fixture instead.
- Every `example/*.test.js` for a migrated app — rewritten to spin up the app via its (unchanged
  call shape) `index.js`/`serverBased({ configPath }).run()` and hit it over HTTP, same style
  `time-tracking-app.test.js` already uses. `combined-2-apps.test.js`,
  `combined-3-apps.test.js`, `combined-mini-store-blog.test.js`, `function-registry.test.js` are
  deleted along with their examples (or merged, per the Open questions below).

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

Regarding point #1: Provide simpler explanation, I can not understand why do we need "/" route if we specifically assign functions per route in serverbased.json file;
Regarding point #2: Delete those apps named as "combined...";
Add "/function-registry/functions/plugins/" folder, place CartPlugin within, require it in cart.js function, make sure tests are green;
Regarding point #3: Split into multi functions following same folders convention as to "function-registry" sample, Use http in function, which needs to get data from the outside function's plugin;
Regarding point #4: no need to perform any actions, as I monitor the process, and do commit the changes with necessary steps after (we will do the steps one by one, not the whole migration at once);
Regarding point #5: remove `runningMode` and `routerEngine` options from the serverbased api as well as update tests correspondingly;

### Resolution — point #1, closed (2026-09-11)

Point #1 asked *why* a root-mount route (`"/"`/`""`) would ever be needed at all, given every
function already gets an explicit `route` in `serverbased.json`. Confirmed: **no root-mount
special case** — every function's own handler routes stay self-contained (e.g. `todo-app`
migrates with its handlers still declaring `/todo`, `/todo/:todoId`, not `/`), and the function's
`route` in `serverbased.json` is whatever prefix is wanted, same as
`cart`/`greeter`/`projects`/`reports` already do — that's how the framework knows where each
function is mounted. No `"/"`/`""` special case needed in `lib/function-registry-config.js`; the
"needs a decision" note under `lib/function-registry-config.js` in the Solution draft above is
now resolved (functionally unchanged, no new code path required there).

### Resolution — point #2, done (2026-09-11)

- Deleted `example/combined-2-apps`, `example/combined-3-apps`, `example/combined-mini-store-blog`
  (`index.js` + test file each) — nothing else referenced them at the code level.
- Added `example/function-registry/functions/plugins/cart.plugin.js` (moved `CartPlugin` out of
  `cart.js` into its own file, under a `plugins/` folder — same convention `example/mini-store`
  already uses for `cart.plugin.js`/`sale.plugin.js`), `cart.js` now `require`s it.
- Updated docs to match: `docs/state/examples-and-tests.md` (dropped the three deleted
  examples/tests, updated the `function-registry` example/test rows), `docs/api/README.md`
  (dropped the `combined-*` mention from the Examples line).
- Full suite green: 13 suites / 73 tests (was 16/80 before the deletions).

### Resolution — point #3, done (2026-09-11)

`example/mini-store` split into two config-loaded functions, same `example/function-registry`
folder convention:

- `functions/cart.js`, mounted at `/cart` — same four cart handlers as before (`GET /:cartId`,
  `POST /:cartId/items`, `DELETE /:cartId/items/:itemId`, `DELETE /:cartId`), own `CartPlugin`
  (moved to `functions/plugins/cart.plugin.js`), reachable as `context.cart`.
- `functions/sale.js`, mounted at `/sale` — the former `GET /cart/:cartId/checkout` handler,
  now `GET /:cartId/checkout` → `/sale/:cartId/checkout` (URL-shape change — was under `/cart`,
  now under `/sale`, since two functions can't share a mount prefix). Own `SalePlugin` (moved to
  `functions/plugins/sale.plugin.js`), reachable as `context.sale`. No longer reads `cart`'s items
  in-process (`context.cart.getItems(cartId)` doesn't exist here — different function, different
  plugin instance); instead fetches `GET /cart/:cartId` over HTTP using the same `fetchJson` +
  `http` module pattern `example/time-tracking-app/functions/reports.js` already established for
  `/reports/summary` → `/entries`.
- `serverbased.json` lists both; `index.js` collapsed to the same thin `configPath`-only shape as
  `example/function-registry/index.js` (mini-store had no host-level `handlers` to keep).
- `mini-store.test.js` rewritten to boot via `configPath` instead of importing `{ handlers,
  plugins }` from `index.js`; checkout assertions moved to `/sale/:cartId/checkout`; added a test
  asserting `/sale/:cartId/checkout` correctly reads `/cart`'s data across the HTTP boundary.
- Docs updated: `docs/state/examples-and-tests.md` (`mini-store` example description rewritten),
  `docs/state/open-items.md` (path reference for the plugin-constructor-arguments item),
  `docs/state/core.md` ("Composed apps merge `plugins`" bullet rewritten — no longer references
  the deleted `combined-mini-store-blog` example; new bullet describing the functions-based
  isolation `mini-store` now demonstrates instead).
- Full suite green: 13 suites / 74 tests (was 73 before this — one net new test).

### Follow-up — shared `fetchJson` helper extracted (2026-09-11)

`sale.js` and `reports.js` each had their own copy of the same GET-JSON helper for the
cross-function-HTTP pattern. Extracted to `lib/fetch-json.js` (`fetchJson(url)`), exported from
`lib/server-based.js` (the actual entry point every example already imports from — `package.json`'s
`main: "index.js"` doesn't correspond to a real file, so this is where "the framework's public
API" concretely lives). Both `example/mini-store/functions/sale.js` and
`example/time-tracking-app/functions/reports.js` now `require('.../lib/server-based').fetchJson`
instead of hand-rolling it. Added `lib/fetch-json.test.js` (4 tests: success, non-JSON body
rejects, connection error rejects, exported correctly from `server-based.js`). Docs updated:
`docs/state/core.md` (new bullet under "Function registry"), `docs/api/server-based.md` (new
`### fetchJson(url)` section). Full suite green: 14 suites / 78 tests.

### Resolution — point #4, acknowledged

No action taken on cadence itself — confirms the migration proceeds step by step, with commits
between steps, not as one large cutover. This turn's actions (points #2 and #5) are examples of
that cadence in practice.

### Resolution — point #5, done (2026-09-11)

- `lib/server-based.js`: removed `runningMode` and `routerEngine` from `defaults`, from
  `serverBased(...)`'s destructured config, and from its returned object. `networkProtocol` and
  `endpointType` are untouched (still declared, still unused/not-branched-on where already true —
  not part of this request).
- `lib/server-based.test.js`: removed `runningMode`/`routerEngine` from the factory-defaults test
  (`"server-based creates own entity successfully"`).
- Docs updated to match: `docs/state/core.md` (dropped the `routerEngine` bullet, reworded the
  `runningMode`/`endpointType` bullet, noted the removal), `docs/api/server-based.md` (dropped
  both rows from the config table and both fields from the `defaults` export block, reworded the
  trailing note), `docs/state/open-items.md` (dropped the now-stale "`runningMode`/`routerEngine`
  enums remain untouched/unused" clause from the Function registry entry).
- Full suite green (same 13/73 run as point #2 above — both landed together).


## Phase 0 — verified: functions can already provide their own plugins via context

Before committing to the migration, the question was raised: *can a function loaded via
`configPath` already bring its own named plugin (like `store`) and use it through context, not
HTTP?* Answer: **yes, already works today**, unchanged by this migration — confirmed by code
inspection and now by tests:

- `lib/function-registry-config.js` maps a function module's own `plugins` array through
  `toPlugin`, exactly like `serverBased()`'s top-level `plugins`.
- `lib/server-based.js`'s function loop builds `functionPluginInstances` from
  `functionEntry.plugins` the same way it builds the host's own `pluginInstances`, then passes
  them into `registerHandlers(functionRouter, functionEntry.handlers, functionPluginInstances)` →
  `injectContext` → `context.<pluginName>`. In-process, scoped to that function's own router —
  isolated from every other function and the host, same story the default `store` plugin already
  had.

This was previously unverified — no test exercised a function's own *named* plugin via
`configPath` (only the top-level `plugins` field and the auto-injected default `store` were
covered). Added:

- `example/function-registry/functions/cart.js` — a new function bringing its own `CartPlugin`,
  reachable as `context.cart`, mounted at `/cart` via `example/function-registry/serverbased.json`.
- Two integration tests in `example/function-registry/function-registry.test.js`: the plugin
  resolves and works over HTTP calls to the function's own routes, and a fresh `run()` call gets
  a fresh plugin instance (no state leak across app instances — mirrors the existing guarantee
  `example/mini-store/mini-store.test.js` proves for top-level plugins).
- One unit test in `lib/function-registry-config.test.js` — the loader passes a function's
  `plugins` through `toPlugin` correctly, independent of the HTTP layer.

All 12 tests (existing + new) pass. This unblocks Decision 3 above and de-risks the migration:
the plugin-injection mechanism the whole config-only model leans on for per-function
functionality is proven to already work, not something the migration needs to build.

## Migration log

Per-app migrations, tracked separately from the resolution log above (which covers the open
questions, not individual example migrations).

### `example/markdown-app`, done (2026-09-11)

- `functions/quote.js` — the single `handlerGetQuote` moved as-is, `route` changed from `/quote`
  to `/` (the function's mount point at `/quote`, set in `serverbased.json`, is the whole
  meaningful path — same convention `example/time-tracking-app/functions/projects.js` already
  uses for `route: '/'`). The module's own `middlewares` (`cacheMarkdownData`) moved with it —
  now scoped to this function's mount only, not applied globally (previously
  `serverBased()`'s top-level `middlewares` were applied via `app.use(...)` for every route in
  the app; not observable here since `markdown-app` only ever had this one route, but is the same
  fix Decision 1 covers for apps with more than one route).
- `serverbased.json` — one entry (`quote` → `functions/quote.js`, route `/quote`).
- `index.js` — collapsed to the same thin `configPath`-only shape as `example/function-registry`
  and `example/mini-store` (`markdown-app` had no plugins to carry over, no other host-level
  concerns).
- `markdown-app.test.js` — rewritten to boot via `configPath` instead of importing `{ handlers,
  middlewares }` from `index.js`. Same two assertions (title/text rendered, falls back to "not
  provided"), same URL (`GET /quote` — unchanged, since the function's `route` reproduces it
  exactly).
- Docs updated: `docs/state/examples-and-tests.md` (example description rewritten),
  `docs/api/README.md` and `docs/api/server-based.md` (moved `markdown-app` out of the
  "single-module usage" example grouping into the `configPath`/function-registry grouping, since
  it's no longer a standalone-`handlers` example).
- Full suite green: 14 suites / 78 tests (unchanged count — same 2 tests, same total, migration
  is behavior-preserving).

### Follow-up — `json2md` scoped to `example/markdown-app` only (2026-09-11)

`json2md` was a dependency of `app/exploring/packages/server-based/package.json` even though only
`example/markdown-app/functions/quote.js` ever used it. Added
`example/markdown-app/package.json` (own `json2md` dependency) and ran `npm install` inside that
folder — Node's module resolution checks the closest `node_modules` up the directory tree first,
so `require('json2md')` from `functions/quote.js` now resolves from
`example/markdown-app/node_modules` before it would reach the parent package's. Removed `json2md`
from `app/exploring/packages/server-based/package.json`'s own dependencies. Verified the scoping
is real (not just declarative) by deleting the old hoisted copy from
`server-based/node_modules/json2md` and re-running the suite — still green. This repo's Lerna glob
(`app/*/packages/*`) doesn't cover `example/markdown-app`, so this isn't a Lerna-managed package —
same pattern already used elsewhere in the monorepo for standalone folders with their own
`package.json`/`package-lock.json` outside the Lerna glob (e.g. `src/packages/npm-sandbox`).
Full suite green: 14 suites / 78 tests (unchanged — this only changes where the dependency is
installed from, not any behavior).

### `example/todo-app`, done (2026-09-11)

- `functions/todo.js` — the 5 CRUD handlers moved as-is, routes trimmed to their leaf form
  relative to the function's `/todo` mount (`GET /`, `GET /:todoId`, `POST /`, `PUT /`,
  `DELETE /:todoId`) — same shape the mount prefix already produced (`GET /todo`, `GET
  /todo/:todoId`, etc.), URLs unchanged. `loggingMiddleware`/`verifyingMiddleware` moved with it,
  now scoped to this function's mount only, not global.
- **Seeding via a custom `store` plugin, per this request**: added
  `functions/plugins/todo-store.plugin.js` — `TodoStorePlugin extends Map`, seeding the `todos`
  key in its constructor (`super([['todos', new Map([['1', {...}]])]])`). Registered as `{ name:
  'store', plugin: TodoStorePlugin }` in `functions/todo.js`'s own `plugins`, overriding the
  framework's default `store` plugin for this function only (same override mechanism
  `docs/api/server-based.md`'s Plugins section already documents — "supply your own `{ name:
  'store', plugin: MyStoreClass }` to override it"). Every handler's `context.conductState('todos')
  || seedTodos()` fallback is gone — `conductState('todos')` always returns the pre-seeded Map now,
  since seeding happens once at plugin construction (per `run()` call) instead of lazily on first
  handler access. `context.provideState('todos', todos)` calls kept after each mutation for
  consistency with the rest of the codebase's idiom (technically redundant — `conductState`/
  `provideState` operate on the same underlying `Map` reference, no cloning — but every other
  handler in the codebase that mutates a `conductState`-returned collection re-`provideState`s it
  afterward, so kept it uniform rather than diverging here).
- `serverbased.json` — one entry (`todo` → `functions/todo.js`, route `/todo`).
- `index.js` — collapsed to the thin `configPath`-only shape.
- `todo-app.test.js` — rewritten to boot via `configPath`; same 5 assertions, same URLs. Added one
  new test asserting a fresh, independently-seeded `TodoStorePlugin` instance per `run()` call —
  same pattern `mini-store.test.js` already proves for `CartPlugin`.
- Docs updated: `docs/state/examples-and-tests.md` (example + test-row descriptions rewritten),
  `docs/api/README.md`/`docs/api/server-based.md` (moved `todo-app` out of the "single-module
  usage"/"fuller usage" standalone-`handlers` groupings into the `configPath`/function-registry
  groupings).
- Full suite green: 14 suites / 79 tests (one net new test — the plugin-isolation one).

### Follow-up — `isPlainObject` guard removed from `loggingMiddleware` (2026-09-11)

The guard (`const isPlainObject = ...; const data = isPlainObject ? {...} : body;`) existed only
to survive `todo-app`'s logging middleware running globally across composed modules — specifically
`markdown-app`'s plain-string response, when both were merged via `composeModules` in
`example/combined-3-apps` (deleted, see the point #2 resolution above). With `markdown-app` and
`todo-app` now each their own function with function-scoped `middlewares`, that collision is
structurally impossible — `loggingMiddleware` only ever sees `todo-app`'s own responses, which are
always plain objects (`context.provideReply({...}).send()`). Simplified back to the unconditional
`{ ...body, logs: 'submitted' }`. Updated `docs/park/per-module-middleware-isolation.md` (added a
resolved-note at the top, kept the historical bug narrative below it as a record — not rewritten)
and `docs/state/open-items.md` (marked the "Per-module middleware isolation" item
`[Resolved 2026-09-11]`, noting it was resolved by function-scoping from this migration, not by
the still-open `router-based-mounting` item, which remains specifically about `composeModules`
until that's deleted per Decision 2). Full suite green: 14 suites / 79 tests (unchanged — behavior
identical, just simpler code).

### `example/blog-app`, done (2026-09-11)

- `functions/blog.js` — the 5 CRUD handlers moved as-is, routes trimmed to leaf form relative to
  the function's `/posts` mount (`GET /`, `GET /:postId`, `POST /`, `PUT /:postId`,
  `DELETE /:postId`), same URLs as before. `loggingMiddleware` moved with it, now function-scoped.
- Seeding via a custom `store` plugin, same pattern as `example/todo-app`: added
  `functions/plugins/blog-store.plugin.js` — `BlogStorePlugin extends Map`, seeding the `posts`
  key in its constructor. Registered as `{ name: 'store', plugin: BlogStorePlugin }`. Every
  handler's `context.conductState('posts') || seedPosts()` fallback is gone. The per-post view
  counter (`views:<postId>`) stays unseeded/lazy — no meaningful value until a post is actually
  viewed, so seeding it wouldn't make sense the way seeding `posts` does.
- `serverbased.json` — one entry (`blog` → `functions/blog.js`, route `/posts`).
- `index.js` — collapsed to the thin `configPath`-only shape.
- `blog-app.test.js` — rewritten to boot via `configPath`; same 7 assertions, same URLs. Added one
  new test asserting a fresh, independently-seeded `BlogStorePlugin` instance per `run()` call.
- Docs updated: `docs/state/examples-and-tests.md` (example + test-row descriptions rewritten).
  `blog-app` was the last example still in the "single-module usage"/"fuller usage" standalone-
  `handlers` groupings in `docs/api/README.md` and `docs/api/server-based.md` — with it migrated,
  every `example/*` app now goes through `configPath`, so both docs were reworded to point at
  `lib/server-based.test.js` instead for the raw standalone-`handlers`/`middlewares` API surface
  (that surface itself isn't gone — `serverBased()` still accepts `handlers`/`middlewares`/
  `plugins` today, per-function; just no longer demonstrated by a top-level, no-`configPath`
  example app).
- Full suite green: 14 suites / 80 tests (one net new test — the plugin-isolation one).

### `example/time-tracking-app`, done (2026-09-11)

- `functions/entries.js` (new) — the 3 time-entry handlers (`start`, `stop`, `list`) moved out of
  `index.js`'s top-level `handlers` array as-is, routes trimmed to leaf form relative to the new
  `/entries` mount (`POST /start`, `POST /:entryId/stop`, `GET /`), same URLs as before. Uses the
  default `store` plugin under the `entries` key, same as it did as a top-level handler — no
  custom plugin needed here (unlike `todo-app`/`blog-app`, this app's seed is just an empty `Map`,
  nothing to pre-populate).
- `serverbased.json` — gained a third entry (`entries` → `functions/entries.js`, route
  `/entries`), alongside the existing `projects`/`reports` entries.
- `index.js` — dropped its own `handlers` array entirely, collapsed to the same thin
  `configPath`-only shape every other migrated example now uses (`handlers: []`).
- `functions/reports.js` — **unchanged**. Its `fetchJson(`${req.protocol}://${req.get('host')}/entries`)`
  call already targeted the *URL* `/entries`, not the in-process host handlers directly — moving
  `/entries` from a top-level handler to its own function changes nothing from `reports.js`'s
  point of view, since it was already crossing an HTTP boundary to reach it. This is exactly the
  isolation boundary the app was designed to demonstrate from the start.
- `time-tracking-app.test.js` — rewritten to boot via a shared `startTimeTrackingApp(port)` helper
  (`configPath`-only, no more `require('./index').handlers`) reused across all 4 existing tests;
  same assertions, same URLs, no behavior change.
- Docs updated: `docs/state/examples-and-tests.md` (example + test-row descriptions — dropped the
  "declarative `handlers`"/"host" framing for `/entries`, now described alongside `/projects`/
  `/reports` as one of three equal config-loaded functions), `docs/state/open-items.md` (the
  "functions default to an isolated store" decision entry and the "see `example/time-tracking-app`
  for the full pattern" pointer both dropped their now-stale "host app"/"declarative `handlers`"
  references to `/entries`).
- Full suite green: 14 suites / 80 tests (unchanged count — same 4 tests, migration is
  behavior-preserving).

All four single-app examples (`todo-app`, `blog-app`, `markdown-app`, `mini-store`) plus
`time-tracking-app` are now fully config-driven — **no `example/*` app anywhere in the repo still
passes top-level `handlers`/`middlewares`/`plugins` to `serverBased(...)`.** The only remaining
callers of that standalone shape are `lib/server-based.js`'s own test suite
(`lib/server-based.test.js`) and `lib/compose.test.js`/`lib/compose.js` (`composeModules`,
Decision 2 — not yet deleted). Decision 1 (dropping `handlers`/`middlewares`/`plugins` from
`serverBased(...)`'s accepted config, making `configPath` required) is now unblocked from the
example side — the remaining work is purely in `lib/server-based.js` itself and its own test
suite, not in any example app.

### Follow-up — `entries`/`projects` seeded via scoped `store` plugins (2026-09-11)

`functions/entries.js` and `functions/projects.js` still relied on lazy
`context.conductState(key) || seedX()` fallbacks in every handler, same pattern `todo-app`/
`blog-app` had before their own migrations. Brought them in line: added
`functions/plugins/entries-store.plugin.js` (`EntriesStorePlugin extends Map`, seeds the
`entries` key with an empty `Map`) and `functions/plugins/projects-store.plugin.js`
(`ProjectsStorePlugin`, seeds `projects` the same way). Registered as each function's own `{
name: 'store', plugin: ... }`, overriding the framework default. Unlike `todo-app`'s/`blog-app`'s
seed data (a pre-existing todo/post), these seeds are scoped to just guaranteeing the key is
always present as an empty `Map` — there's no starting entry/project to pre-populate, only the
key itself needs to exist so handlers never see `undefined`. `functions/reports.js` intentionally
untouched — keeps the framework's default `store` plugin, since its `summaryRequests` counter has
no meaningful value to seed in advance (same reasoning `blog-app`'s `views:<postId>` counter got
for staying unseeded). Added one new test, `time-tracking-app.test.js`: "each run() gets its own
seeded EntriesStorePlugin/ProjectsStorePlugin instances — no state leaks across server instances"
— same convention `todo-app.test.js`/`blog-app.test.js` established. Docs updated:
`docs/state/examples-and-tests.md` (example description now distinguishes the two scoped-seed
plugins from `/reports`' unseeded default store; test-row description updated). Full suite green:
14 suites / 81 tests (one net new test).
