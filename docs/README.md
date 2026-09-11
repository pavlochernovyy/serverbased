# `server-based` docs

## What it is

A tiny functional wrapper around Express that turns a declarative config object into
a running HTTP server. Entry point: `serverBased(config).run()` in `lib/server-based.js`.
A plugin system (`ContextProvider` + `serverBased`'s `plugins` config) lets per-app state
and behavior be attached onto the request context under a name (`context.<name>`), with a
default `store` plugin (a `Map`) auto-injected for backward compatibility with
`provideState`/`conductState`. A composition helper (`composeModules`, `lib/compose.js`)
lets independently-authored feature modules (each `{ handlers, middlewares?, plugins? }`)
be merged into one app. A function registry (`configPath` + `lib/function-registry-config.js`)
mounts feature modules listed in a `serverbased.json` file, read once at startup.

## Folders

| folder | purpose |
|--------|---------|
| [`api/`](./api/README.md) | API reference — function signatures, params, return values |
| [`state/`](./state/) | current state of the system — what exists and why (see below) |
| [`drafts/`](./drafts/) | design write-ups for a specific piece of work, in progress or completed (e.g. [`function-registry.task.md`](./drafts/function-registry.task.md)) |
| [`park/`](./park/) | postponed/parked items — the full idea, why it was postponed, a solution sketch, open questions. Pointed to from [`state/open-items.md`](./state/open-items.md). Currently: [`router-based-mounting.md`](./park/router-based-mounting.md), [`per-module-middleware-isolation.md`](./park/per-module-middleware-isolation.md) |
| [`upcoming-ideas/`](./upcoming-ideas/) | dated scratch notes (`upcoming-idea.<DD-MM-YYYY>.txt`), one per working session — informal, not curated like the rest of `docs/` |

## `state/` sections

| file | covers |
|------|--------|
| [`state/core.md`](./state/core.md) | `serverBased` factory, `toHandler`, `ContextProvider`, the plugin system, error handling |
| [`state/compose.md`](./state/compose.md) | `composeModules`, `test-fixtures.js`, the middleware sharp edge it introduced, plugin-name collision handling |
| [`state/examples-and-tests.md`](./state/examples-and-tests.md) | what each `example/*` app demonstrates, what each test file covers |
| [`state/open-items.md`](./state/open-items.md) | declined/postponed/not-started work, for picking up later |

`state/` is about *what exists and why*; for the full API surface (function signatures, params, return values), see [`api/`](./api/README.md) instead.

## `api/` sections

| file | covers |
|------|--------|
| [`api/server-based.md`](./api/server-based.md) | `serverBased(config)`, `toHandler(handlerConfig)`, `toPlugin(pluginConfig)`, `handlerType` (`context`/`origin`), `plugins` config field, `configPath`/function registry, minimal example, global/per-handler middleware, `defaults` export |
| [`api/context-provider.md`](./api/context-provider.md) | `ContextProvider` methods, typical handler shape, the plugin system (`context.<pluginName>`), `provideState`/`conductState` app-scoped state |
| [`api/errors.md`](./api/errors.md) | `ServerBasedError`, `HandlerError`, `RuntimeError`, `ComposeError`, `FunctionRegistryError`, `runtimeErrorHandlingMiddleware` |
| [`api/compose.md`](./api/compose.md) | `composeModules(...modules)`, `ComposeError`, things to watch when composing feature modules, including plugin-name collisions |

`api/` is about *how to call it*; see [`api/README.md`](./api/README.md) for the full index, including example apps to reference.
