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
| [`server-based.md`](./server-based.md) | `serverBased(config)`, `toHandler(handlerConfig)`, `handlerType` (`context`/`origin`), minimal example, global/per-handler middleware, `defaults` export |
| [`context-provider.md`](./context-provider.md) | `ContextProvider` methods, typical handler shape, `provideState`/`conductState` app-scoped state |
| [`errors.md`](./errors.md) | `ServerBasedError`, `HandlerError`, `RuntimeError`, `runtimeErrorHandlingMiddleware` |
| [`compose.md`](./compose.md) | `composeModules(...modules)`, `ComposeError`, things to watch when composing feature modules |

## Examples

See `example/todo-app`, `example/markdown-app`, `example/blog-app` for single-module usage (global/per-handler middleware, route params, `origin`-type handlers, request body/query handling), and `example/combined-2-apps`/`example/combined-3-apps` for `composeModules` in action.
