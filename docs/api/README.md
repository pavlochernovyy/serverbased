# server-based — API reference (index)

`server-based` turns a declarative config object into a running Express server.
Source: `lib/server-based.js`, `lib/context.provider.js`, `lib/compose.js`.

```js
const { serverBased } = require('./lib/server-based');

serverBased({ title, purpose, version, handlers: [...] }).run();
```

## Sections

| file | covers |
|------|--------|
| [`server-based.md`](./server-based.md) | `serverBased(config)`, `toHandler(handlerConfig)`, `toPlugin(pluginConfig)`, `handlerType` (`context`/`origin`), `plugins` config field, minimal example, global/per-handler middleware, `defaults` export |
| [`context-provider.md`](./context-provider.md) | `ContextProvider` methods, typical handler shape, the plugin system (`context.<pluginName>`), `provideState`/`conductState` app-scoped state |
| [`errors.md`](./errors.md) | `ServerBasedError`, `HandlerError`, `RuntimeError`, `ComposeError`, `runtimeErrorHandlingMiddleware` |
| [`compose.md`](./compose.md) | `composeModules(...modules)`, `ComposeError`, things to watch when composing feature modules, including plugin-name collisions |

## Examples

See `example/todo-app`, `example/markdown-app`, `example/blog-app` for single-module usage (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling); `example/mini-store` for the plugin system (`CartPlugin`, `SalePlugin`); and `example/combined-2-apps`/`example/combined-3-apps`/`example/combined-mini-store-blog` for `composeModules` in action, the last composing named plugins alongside the default `store` plugin.
