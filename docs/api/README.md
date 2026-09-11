# server-based — API reference (index)

← [index](../README.md)

`server-based` turns a declarative config object into a running Express server.
Source: `lib/server-based.js`, `lib/context.provider.js`, `lib/compose.js`, `lib/function-registry-config.js`.

```js
const { serverBased } = require('./lib/server-based');

serverBased({ title, purpose, version, handlers: [...] }).run();
```

## Sections

| file | covers |
|------|--------|
| [`server-based.md`](./server-based.md) | `serverBased(config)`, `toHandler(handlerConfig)`, `toPlugin(pluginConfig)`, `handlerType` (`context`/`origin`), `plugins` config field, `configPath`/function registry, minimal example, global/per-handler middleware, `defaults` export |
| [`context-provider.md`](./context-provider.md) | `ContextProvider` methods, typical handler shape, the plugin system (`context.<pluginName>`), `provideState`/`conductState` app-scoped state |
| [`errors.md`](./errors.md) | `ServerBasedError`, `HandlerError`, `RuntimeError`, `ComposeError`, `FunctionRegistryError`, `runtimeErrorHandlingMiddleware` |
| [`compose.md`](./compose.md) | `composeModules(...modules)`, `ComposeError`, things to watch when composing feature modules, including plugin-name collisions |

## Examples

See `lib/server-based.test.js` for the raw standalone-`handlers`/`middlewares` API surface (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling) — every `example/*` app now goes through `configPath`; `example/mini-store` for the plugin system (`CartPlugin`, `SalePlugin`); and `example/function-registry`/`example/time-tracking-app`/`example/markdown-app`/`example/todo-app`/`example/blog-app` for `configPath`/function-registry usage, including a function providing its own named plugin via context, a function overriding the default `store` plugin to seed its own state, and a function's own scoped `middlewares`.
