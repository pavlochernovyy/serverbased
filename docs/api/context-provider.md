# `ContextProvider` (`lib/context.provider.js`)

← [index](./README.md) · see also [server-based](./server-based.md) (`handlerType: 'context'`)

Instantiated per-request for `handlerType: 'context'` handlers, passed as the `context` argument.

| method                          | returns             | description |
|----------------------------------|---------------------|--------------|
| `fetchRequest()`                 | Express `req`       | raw request object — use for `.body`, `.query`, `.params`, `.headers`, etc. |
| `fetchParamsInt(scopeToInt?)`    | `object`             | route params (`req.params`); if `scopeToInt` (array of key names) is given, those keys are parsed with `parseInt(value, 10)`, all other keys passed through as strings. Omit `scopeToInt` to get raw string params |
| `provideReply(data)`             | `this` (chainable)   | stages `data` as the reply payload |
| `send()`                         | `void`               | sends the staged reply via `res.send()`, default status `200` |
| `sendWithCode(code)`             | `void`               | sends the staged reply via `res.status(code).send()` |
| `provideState(key, value)`       | `this` (chainable)   | writes `value` under `key` into the injected `store` plugin (a `Map` by default) |
| `conductState(key)`              | `any`                | reads `value` back for `key` from the `store` plugin; `undefined` if never set |

Typical handler:

```js
run(context) {
  const { postId } = context.fetchRequest().params;
  const post = storage.posts.get(postId);
  if (!post) {
    context.provideReply({ message: 'not found' }).sendWithCode(404);
    return;
  }
  context.provideReply({ data: post }).send();
}
```

## Plugins

`ContextProvider` can be extended with named plugin instances, passed via a function module's own `plugins` field (see [server-based.md](./server-based.md#plugins) — every route now lives inside a function module listed in `serverbased.json`, there's no top-level `plugins` config on `serverBased(...)` itself). Each `{ name, plugin }` descriptor is instantiated once per `run()` call and exposed on the context under `name`:

```js
class GreeterPlugin {
  greet(name) {
    return `hello, ${name}`;
  }
}

// module.exports = { handlers: [...], plugins: [{ name: 'greeter', plugin: GreeterPlugin }] };

run(context) {
  context.provideReply({ message: context.greeter.greet('world') }).send();
}
```

A plugin instance is shared by every handler and every request of that app instance, but a fresh instance is created for each `run()` call — so separate app instances (different apps, or different test servers) never share plugin state. See `example/mini-store-app` (`CartPlugin`) for a fuller example.

## State (`provideState`/`conductState`)

`provideState`/`conductState` are a thin wrapper around a plugin named `store` — a `Map`-like object exposing `get`/`set`. When a function doesn't supply its own `store` plugin, `run()` auto-injects a default one (a plain `Map`, defined in `lib/plugins/state-store.plugin.js`) per function, per `run()` call — see "Default `store` plugin" in `server-based.js`. This makes `provideState`/`conductState` a lightweight, function-scoped key/value store by default, shared by every handler and every request within that function — but isolated from any other function (even in the same running app) and from any other `serverBased()` instance. Supplying your own `{ name: 'store', plugin: MyStoreClass }` (any class exposing `get`/`set`) overrides the default.

There's no built-in seeding on the default `store` — reading a key that was never set returns `undefined`. Two patterns exist depending on whether there's a meaningful starting value:

- **No starting value to seed** (a counter, an initially-empty collection) — read lazily, falling back inline on first access:

  ```js
  run(context) {
    const posts = context.conductState('posts') || new Map();
    context.provideState('posts', posts);

    context.provideReply({ data: Object.fromEntries(posts) }).send();
  }
  ```

- **A real starting value to seed** — supply your own `store` plugin whose constructor pre-populates the key, so every handler can call `conductState(key)` directly without a fallback (see `example/todo-app`'s `TodoStorePlugin`/`example/blog-app`'s `BlogStorePlugin`, `functions/plugins/*.plugin.js`):

  ```js
  class PostsStorePlugin extends Map {
    constructor() {
      super([['posts', new Map([['1', { title: 'first post' }]])]]);
    }
  }

  // module.exports = { handlers: [...], plugins: [{ name: 'store', plugin: PostsStorePlugin }] };

  run(context) {
    const posts = context.conductState('posts'); // always the seeded Map, no fallback needed
    context.provideReply({ data: Object.fromEntries(posts) }).send();
  }
  ```

It's a generic in-memory scratch store, not a persistence layer — nothing survives a process restart. See `example/blog-app` (seeded post storage plus a lazily-initialized per-post view counter — both patterns in one example) and `example/todo-app` for it in use, and `lib/server-based.test.js` ("shares provideState/conductState across requests and handlers") for a minimal, storage-free demonstration.

**Store is per-function, not shared across an app.** Each function gets its own default `store` plugin instance (or its own overridden one) — a function's `provideState`/`conductState` never sees another function's state, even within the same running app, so key names only need to be distinct *within* one function, not across the whole app. See "Function registry" in [server-based.md](./server-based.md#function-registry-configpath).
