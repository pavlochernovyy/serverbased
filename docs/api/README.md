# server-based — API reference (index)

← [index](../README.md)

`server-based` turns a declarative config object into a running Express server.
Source: `lib/server-based.js`, `lib/context.provider.js`, `lib/function-registry-config.js`.

```js
const path = require('path');
const { serverBased } = require('./lib/server-based');

serverBased({ title, purpose, version, configPath: path.join(__dirname, 'serverbased.json') }).run();
```

`configPath` is required — every route/middleware/plugin lives in a function module listed
there, see [`server-based.md`](./server-based.md#function-registry-configpath).

## Sections

| file | covers |
|------|--------|
| [`server-based.md`](./server-based.md) | `serverBased(config)`, `toHandler(handlerConfig)`, `toPlugin(pluginConfig)`, `handlerType` (`context`/`origin`), `plugins` config field, `configPath`/function registry, minimal example, global/per-handler middleware, `defaults` export |
| [`context-provider.md`](./context-provider.md) | `ContextProvider` methods, typical handler shape, the plugin system (`context.<pluginName>`), `provideState`/`conductState` app-scoped state |
| [`errors.md`](./errors.md) | `ServerBasedError`, `HandlerError`, `RuntimeError`, `FunctionRegistryError`, `runtimeErrorHandlingMiddleware` |

## Examples

See `lib/server-based.test.js` for the fullest `handlers`/`middlewares`/`plugins` API surface (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling) — it exercises `serverBased({ configPath })` against fixture function modules generated on the fly (`writeFunctionConfig`, `lib/test-fixtures.js`) rather than a real `example/*` app, since every route/middleware/plugin now lives inside a function module; `example/mini-store-app` for the plugin system (`CartPlugin`, `SalePlugin`); and `example/hello-world-app`/`example/time-tracking-app`/`example/markdown-app`/`example/todo-app`/`example/blog-app` for `configPath`/function-registry usage in real apps, including a function providing its own named plugin via context, a function overriding the default `store` plugin to seed its own state, and a function's own scoped `middlewares`.
