# server-based — current state (index)

## What it is

A tiny functional wrapper around Express that turns a declarative config object into
a running HTTP server. Entry point: `serverBased(config).run()` in `lib/server-based.js`.
A plugin system (`ContextProvider` + `serverBased`'s `plugins` config) lets per-app state
and behavior be attached onto the request context under a name (`context.<name>`), with a
default `store` plugin (a `Map`) auto-injected for backward compatibility with
`provideState`/`conductState`. A composition helper (`composeModules`, `lib/compose.js`)
lets independently-authored feature modules (each `{ handlers, middlewares?, plugins? }`)
be merged into one app.

## Sections

| file | covers |
|------|--------|
| [`core.md`](./core.md) | `serverBased` factory, `toHandler`, `ContextProvider`, the plugin system, error handling |
| [`compose.md`](./compose.md) | `composeModules`, `test-fixtures.js`, the middleware sharp edge it introduced, plugin-name collision handling |
| [`examples-and-tests.md`](./examples-and-tests.md) | what each `example/*` app demonstrates, what each test file covers |
| [`open-items.md`](./open-items.md) | declined/postponed/not-started work, for picking up later |

For the full API surface (function signatures, params, return values), see `docs/api/` instead — this folder is about *what exists and why*, not *how to call it*.
