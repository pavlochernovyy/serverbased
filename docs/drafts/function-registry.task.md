### Task state: Implemented

Goal: a constantly-running server-based instance acts as an entry point that reads a declarative `serverbased.json` config file and mounts each independently-authored "function" it lists — each function shaped like today's feature module (own `handlers`/`plugins`, own file), so the function-authoring experience stays consistent with the existing module pattern.

Pickup mechanism (decided): declarative config, not live filesystem watching. `serverbased.json` lists every function's `path` (to its module file) and `route` (its mount prefix). The server reads this file once at startup, `require`s each listed `path`, and mounts its handlers under its `route`. No runtime add/remove/on/off — enabling, disabling, or adding a function means editing `serverbased.json` and restarting the process. There is no runtime registry, no file watcher, no per-function status state machine.

Invocation mechanism (decided): in-process `require` + call the exported module, no process spawning.

The context-based handler model remains the foundation (handler logic doesn't touch Express directly). `runningMode`/`routerEngine` enums are not touched by this feature — out of scope.

## Solution draft (first increment)

Scope: static `serverbased.json` config, read once at startup, no dependency on `fs.watch`, no runtime enable/disable API, no new dependency — `JSON.parse` on a plain file, same as `package.json`.

### `serverbased.json`

```json
{
  "functions": {
    "cart": {
      "path": "./functions/cart.js",
      "route": "/cart"
    },
    "delivery": {
      "path": "./functions/delivery.js",
      "route": "/delivery"
    }
  }
}
```

- `path` — resolved relative to the location of `serverbased.json` itself (consistent with how a config file's own relative paths are normally read; avoids ambiguity from `process.cwd()`).
- `route` — mount prefix for that function's own routes, e.g. a handler registered at `GET /items` inside `cart.js` becomes reachable at `GET /cart/items`, globally accessible like any other route.
- Each function's exported module keeps the same shape `composeModules` already consumes: `{ handlers, middlewares?, plugins? }`.

### Loading (`lib/function-registry-config.js`, new)

`loadFunctionRegistryConfig(configPath)`:
1. Read and `JSON.parse` `serverbased.json`.
2. For each entry under `functions`, resolve `path` relative to the config file, `require` it, validate the exported shape with the existing `toHandler`/`toPlugin` (reuse, don't reimplement).
3. Mount each function's `handlers` under its `route` via `app.use(route, router)` — one `express.Router()` per function, routes registered on it using the same handler-registration/`injectContext` wiring `server-based.js` already uses for the top-level app (factor that loop into a small shared helper so both paths use it, rather than duplicating context-injection logic).
4. Instantiate each function's own `plugins` the same way `run()` does today — fresh instances per process start, isolated per function (mirrors how `composeModules` already isolates plugin sets across modules).
5. A malformed entry (bad shape, duplicate route within the function, missing file, or a `route` collision — against the host app's own `handlers`, or against another function's `route`) throws at startup — same fail-fast posture `compose.js`'s duplicate-route check already has. No partial-mount, no per-function error state; a broken function fails the whole boot, same as a bad top-level handler does today.

### Wiring into `serverBased`

`serverBased({ ... configPath })` — new, optional, top-level config key. When present, `run()` calls `loadFunctionRegistryConfig(configPath)` before `app.listen`, and mounts the returned routers alongside the existing handler-registration loop. Omitting `configPath` leaves today's behavior untouched.

### Explicitly out of scope for this increment

- No live filesystem watching, no runtime add/remove.
- No JSON API for enable/disable/dismount — toggling a function means editing `serverbased.json` and restarting. Revisit only if a later increment wants runtime toggling on top of this static base.
- No per-function feature-flag data fields in the config — noted as a later idea (e.g. passing config values into a function to adjust its own behavior), not designed here.
- No process-per-function spawning — stays in-process `require`, as already decided.

## Decisions locked in

1. Config format: `serverbased.json`, plain `JSON.parse` — no new dependency.
2. Terminology: "function" throughout (doc, config key, module names) — "lambda" retired.
3. Route collisions (host vs. function, function vs. function): fail fast at startup, mirroring `composeModules`' existing duplicate-route check.
4. Missing/empty config handling: `configPath` omitted from `serverBased(...)` → silent, treated like any other unused optional field (no log). `configPath` provided but the file is missing or `functions` is empty/absent → not an error, one `console.log` line noting nothing was loaded, mirroring `traceServerBasedMetaData`'s existing startup logging.
5. Additive, not a mode switch: functions from `serverbased.json` mount *alongside* the host app's own `handlers` in the same `run()` call — no revival of the unused `runningMode` enum, no function/app either-or. Route-collision fail-fast (decision 3) is what keeps this safe.
6. Single file, single code path: the wiring (calling the config loader, mounting routers) lives inline in `serverBased(...).run()` in `lib/server-based.js` — no parallel `run()` variant. `lib/function-registry-config.js` stays a small loader/validator module only (parse, resolve paths, `require`, build routers), the same separation `compose.js` already has from `server-based.js`.


## Questions to Solution draft (first increment)

1. How do you plan to load functions if they are not provided?
I think simple logging that rather "serverbased.yml is not provided, skipping" or "functions are not provided in "serverbased.yml"" are fine
2. Do you plan to load them alongside the standard loading serverbased does?
I think we rather need a serverbased config to swithc its running mode (function/app)?
Or we can include all, (which would be perfect), but to check the routes collision, as you proposed ofcourse...
3. Do you plan to edit existing serverbased.js or include a different version particularly for the functions?
I think it worth doing in the same file...
