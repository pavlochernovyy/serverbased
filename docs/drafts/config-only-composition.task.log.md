Execution log for [`config-only-composition.task.md`](./config-only-composition.task.md) — the
design/decisions doc. This file holds every dated resolution, migration, and follow-up entry,
kept separate so the design doc stays readable as *what was decided and why*, not *a chronological
diary of every step taken to get there*.

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

All 12 tests (existing + new) pass. This unblocked Decision 3 and de-risked the migration: the
plugin-injection mechanism the whole config-only model leans on for per-function functionality is
proven to already work, not something the migration needed to build.

## Open-question resolutions

Raw answers as given, then what was actually done for each.

> Regarding point #1: Provide simpler explanation, I can not understand why do we need "/" route if we specifically assign functions per route in serverbased.json file;
> Regarding point #2: Delete those apps named as "combined...";
> Add "/function-registry/functions/plugins/" folder, place CartPlugin within, require it in cart.js function, make sure tests are green;
> Regarding point #3: Split into multi functions following same folders convention as to "function-registry" sample, Use http in function, which needs to get data from the outside function's plugin;
> Regarding point #4: no need to perform any actions, as I monitor the process, and do commit the changes with necessary steps after (we will do the steps one by one, not the whole migration at once);
> Regarding point #5: remove `runningMode` and `routerEngine` options from the serverbased api as well as update tests correspondingly;

### Resolution — point #1, closed (2026-09-11)

Point #1 asked *why* a root-mount route (`"/"`/`""`) would ever be needed at all, given every
function already gets an explicit `route` in `serverbased.json`. Confirmed: **no root-mount
special case** — every function's own handler routes stay self-contained (e.g. `todo-app`
migrates with its handlers still declaring `/todo`, `/todo/:todoId`, not `/`), and the function's
`route` in `serverbased.json` is whatever prefix is wanted, same as
`cart`/`greeter`/`projects`/`reports` already do — that's how the framework knows where each
function is mounted. No `"/"`/`""` special case needed in `lib/function-registry-config.js`; the
loader's existing truthy-`route` requirement stays as-is.

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
between steps, not as one large cutover. Point #2 and point #5's resolutions are examples of that
cadence in practice.

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

## Migration log

Per-app migrations and follow-up cleanups, in the order they landed.

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
the then-still-open `router-based-mounting` item). Full suite green: 14 suites / 79 tests
(unchanged — behavior identical, just simpler code).

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
  (that surface itself wasn't gone yet at this point — `serverBased()` still accepted `handlers`/
  `middlewares`/`plugins` at the top level until Decision 1 landed, see below — just no longer
  demonstrated by a top-level, no-`configPath` example app).
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

At this point all four single-app examples (`todo-app`, `blog-app`, `markdown-app`, `mini-store`)
plus `time-tracking-app` were fully config-driven — no `example/*` app anywhere in the repo still
passed top-level `handlers`/`middlewares`/`plugins` to `serverBased(...)`. The only remaining
callers of that standalone shape were `lib/server-based.js`'s own test suite
(`lib/server-based.test.js`) and `lib/compose.test.js`/`lib/compose.js` (`composeModules`,
Decision 2). This unblocked Decision 1 from the example side.

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

### Follow-up — `example/function-registry` renamed to `example/hello-world-app` (2026-09-11)

The name "function-registry" was the example's original purpose (demonstrating the `configPath`
mechanism as an additive extra alongside standalone `handlers`), but that framing was stale by
this point — every example app now goes through `configPath`, so it's no longer a special/
additive mode worth naming an example after. Renamed the directory
(`example/function-registry` → `example/hello-world-app`) and its test file
(`function-registry.test.js` → `hello-world-app.test.js`), and updated the `title`/error-log
strings in `index.js` and the test file from `'function registry app'` to `'hello world app'`.
**Scoped narrowly**: only this example directory and its own internal strings changed — the
"function registry" *feature* itself (`lib/function-registry-config.js`, `FunctionRegistryError`,
the `configPath` mechanism, and every doc describing that feature) kept its name unchanged; only
doc references pointing at the now-renamed example path were updated (`docs/state/core.md`,
`docs/state/examples-and-tests.md`, `docs/state/open-items.md`, `docs/api/server-based.md`,
`docs/api/README.md`), each noting "renamed 2026-09-11, was `example/function-registry`" so the
history stays traceable. Full suite green: 14 suites / 81 tests (unchanged — pure rename, no
behavior change).

### Follow-up — `example/mini-store` renamed to `example/mini-store-app` (2026-09-11)

Same treatment as `hello-world-app` above, for naming consistency with the other examples
(`todo-app`, `blog-app`, `markdown-app`, `time-tracking-app` all end in `-app`). Renamed the
directory (`example/mini-store` → `example/mini-store-app`) and its test file
(`mini-store.test.js` → `mini-store-app.test.js`). No `title`/error-log string change needed —
`index.js` already said `'mini-store app'`, which already matched. Updated doc references
pointing at the old path: `lib/compose.js` (comment), `docs/state/compose.md`,
`docs/api/compose.md`, `docs/state/core.md`, `docs/api/server-based.md`, `docs/api/README.md`,
`docs/api/context-provider.md`, `docs/state/open-items.md`, `docs/state/examples-and-tests.md` —
plain path substitution only, left `example/combined-mini-store-blog` (a different, already-
deleted example's name, still mentioned as historical context in `docs/park/router-based-mounting.md`)
untouched since it's an unrelated string, not a reference to the renamed directory. Full suite
green: 14 suites / 81 tests (unchanged — pure rename, no behavior change).

### Follow-up — `example/markdown-app`'s `title` renamed to match its folder (2026-09-11)

`index.js`/`markdown-app.test.js` still said `title: 'quote making app'`, left over from before
the folder was named `markdown-app` — didn't match the `-app`-suffixed title convention every
other example now followed (`'todo app'`, `'blog app'`, `'mini-store app'`, `'hello world app'`).
Updated both to `'markdown app'`. No other references existed. Full suite green: 14 suites / 81
tests (unchanged — pure rename, no behavior change).

## Decision 1 landed — config-only composition became the only API (2026-09-11)

With every `example/*` app migrated (see the Migration log above) and no example depending on the
standalone `handlers`/`middlewares`/`plugins` config, `lib/server-based.js` was cut over:

- **`serverBased(config)`** no longer accepts `handlers`/`middlewares`/`plugins` at all — dropped
  from the destructured config, the returned object, and `run()`'s own registration logic.
  `configPath` is now **required** (`serverBased(...)` throws `ServerBasedError` if missing, same
  posture as `title`/`purpose`/`version`).
- **`run()`** dropped its entire top-level plugin-instantiation block, its top-level middleware
  loop, and its top-level `handlers.map(toHandler)`/`assertNoDuplicateRoutes`/`registerHandlers`
  pass — the function-mounting loop (already there for `configPath`) is now the *only* routing
  pass. `traceServerBasedMetaData` dropped its `handlers` log line (nothing to log at that level
  any more) and gained a `"N function(s) mounted"` line instead.
- **Dead code found and removed while doing this**: the function loop's own `seenRoutes`
  duplicate-route check in `server-based.js` turned out to be unreachable — `loadFunctionRegistryConfig`
  already guarantees every returned function entry has a unique `route` (it throws before
  returning otherwise), so the check in `run()` could never trigger. Removed it, with a comment
  explaining why no replacement check is needed there.
- **Real gap found and fixed, not just removed**: dropping the top-level `plugins` loop also
  dropped the only place a duplicate-plugin-name check existed. Since a function's own `plugins`
  is now the *only* way to supply plugins, restored equivalent coverage inside
  `lib/function-registry-config.js` (`loadFunctionRegistryConfig`), next to the existing
  duplicate-route check — throws `FunctionRegistryError` on two plugins sharing a `name` within
  one function's own `plugins` array. Added a unit test for it in
  `lib/function-registry-config.test.js`.
- **Test suite rewrite**: `lib/server-based.test.js` (16 tests), `lib/error-handling.test.js`
  (5 tests), and `lib/context.provider.test.js` (1 test) all called `serverBased({ handlers,
  middlewares, plugins })` directly — none of that shape exists any more. Added
  `writeFunctionConfig(source, { route, id })` to `lib/test-fixtures.js` — writes a function
  module (raw JS source, since `function-registry-config.js` `require`s it from a real file) plus
  a `serverbased.json` pointing at it under a fresh temp dir (same `fs.mkdtempSync` pattern
  `function-registry-config.test.js` already used), returns the resulting `configPath`. Every
  rewritten test now boots `serverBased({ configPath })` against a generated fixture instead of
  passing handlers/middlewares/plugins directly — same assertions, same HTTP-level behavior
  verified, just routed through the sole remaining API. `context.provider.test.js`'s one test was
  also a genuine bug fix in passing: its assertions lived inside a handler that was never actually
  invoked (no HTTP request was ever sent to trigger it, and it used Chai's `.to.be.a(...)` syntax
  which isn't valid against Jest's `expect` — so it would have thrown if it had ever run). Rewrote
  it to send a real request and use throw-based assertions instead.
- **`example/hello-world-app`'s "omitting configPath boots normally" test** no longer made sense
  (that behavior is gone by design) — replaced with a test asserting `serverBased(...)` throws
  `ServerBasedError` when `configPath` is omitted.
- **Docs rewritten** to match the new API surface: `docs/api/server-based.md` (config table,
  minimal example, middleware/plugin sections, function-registry section — substantial rewrite),
  `docs/api/context-provider.md` (plugins section, `provideState`/`conductState` seeding section —
  now documents both the lazy-fallback pattern and the seed-via-custom-plugin pattern side by
  side), `docs/api/errors.md` (error-cause table, export list, timing note), `docs/state/core.md`
  (Core factory/Plugin system/Function registry sections), `docs/README.md` (top overview),
  `docs/api/README.md` (intro snippet and Examples line), `docs/state/examples-and-tests.md`
  (test-file descriptions), `docs/state/open-items.md` (Function registry entry reworded to
  describe current — not historical — behavior, with a note marking the "host app" framing in the
  friction-discovery sub-bullet as historical).
- Full suite green: 14 suites / 84 tests (net +3 vs. before this — the new required-field test,
  the duplicate-plugin-name-in-one-function test, and the function-registry-config duplicate-
  plugin-name unit test).

## Decision 2 landed — `composeModules`/`lib/compose.js` deleted (2026-09-11)

- Deleted outright: `lib/compose.js`, `lib/compose.test.js`, `docs/state/compose.md`,
  `docs/api/compose.md`. No re-export shim, no legacy path — matches Decision 2's original
  posture. Nothing in `lib/server-based.js` or `lib/function-registry-config.js` actually
  `require`d `compose.js` (only comments referenced it), so this was a pure doc/test-suite cleanup
  once the files themselves were gone — updated the two source comments that mentioned
  `compose.js`/`composeModules` for context.
- **Docs updated** everywhere `composeModules`/`ComposeError`/`compose.md` was referenced as
  current, live behavior: `docs/README.md` (top overview, folder/section tables), `docs/api/README.md`
  (source list, sections table, intro snippet), `docs/api/server-based.md` (header nav, function-
  registry section, failure-handling heading), `docs/api/errors.md` (dropped the `ComposeError`
  row entirely, fixed the export list and header nav), `docs/api/context-provider.md` (the "when
  composing modules" section no longer applies — rewritten as "store is per-function, not shared
  across an app," which is the actually-relevant fact for `configPath`-only apps), `docs/state/core.md`
  (Plugin system/Function registry sections), `docs/state/examples-and-tests.md` (dropped the
  `compose.test.js` row).
- **Two open items closed as superseded**, not just edited: `docs/state/open-items.md`'s
  "Mounting composed modules via `app.use(prefix, router)`" item is now moot — the thing it wanted
  (router-per-module mounting) is exactly what the function registry already does for every app,
  and the flat-merge mechanism it was proposing to fix no longer exists to fix. Marked
  `[Superseded 2026-09-11]`, same treatment the middleware-isolation item got when *that* was
  resolved. `docs/park/router-based-mounting.md` got the matching resolved-note treatment (kept
  the original idea/reasoning as historical record below the note, not rewritten) —
  `per-module-middleware-isolation.md`'s existing resolved-note just needed its now-dead
  `compose.md` link removed from the nav line (its historical body text, which mentions
  `compose.md` inline while narrating the original bug, was left alone — same "don't rewrite
  history" posture as everywhere else in this log).
- `.claude/skills/check-if-can-commit/SKILL.md` also referenced `compose.md` in its doc-cross-
  check list — updated.
- Full suite green: 13 suites / 77 tests (−7 vs. before this — `compose.test.js`'s 7 tests, the
  only tests lost).

Both Decision 1 and Decision 2 from the design doc are now fully landed. What remains on the
original open-questions list is genuinely separate follow-on work, not blocking anything: the
"Factory validations for data structures" and "Plugin constructor arguments" items in
`docs/state/open-items.md`.
