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

`ContextProvider` can be extended with named plugin instances, passed via `serverBased`'s `plugins` config field (see [server-based.md](./server-based.md#plugins)). Each `{ name, plugin }` descriptor is instantiated once per `run()` call and exposed on the context under `name`:

```js
class GreeterPlugin {
  greet(name) {
    return `hello, ${name}`;
  }
}

// serverBased({ ..., plugins: [{ name: 'greeter', plugin: GreeterPlugin }] })

run(context) {
  context.provideReply({ message: context.greeter.greet('world') }).send();
}
```

A plugin instance is shared by every handler and every request of that app instance, but a fresh instance is created for each `run()` call — so separate app instances (different apps, or different test servers) never share plugin state. See `example/mini-store` (`CartPlugin`) for a fuller example.

## State (`provideState`/`conductState`)

`provideState`/`conductState` are a thin wrapper around a plugin named `store` — a `Map`-like object exposing `get`/`set`. When the caller doesn't supply their own `store` plugin, `serverBased.run()` auto-injects a default one (a plain `Map`, defined in `lib/plugins/state-store.plugin.js`) — see `store` in `server-based.js`. This makes `provideState`/`conductState` a lightweight, app-scoped key/value store by default, shared by every handler and every request of that app instance — but isolated from any other `serverBased()` instance (e.g. different apps, or different test servers). Supplying your own `{ name: 'store', plugin: MyStoreClass }` (any class exposing `get`/`set`) overrides the default.

There's no built-in seeding — reading a key that was never set returns `undefined`, so handlers typically seed lazily on first access:

```js
const seedPosts = () => new Map([['1', { title: 'first post' }]]);

run(context) {
  const posts = context.conductState('posts') || seedPosts();
  context.provideState('posts', posts);

  context.provideReply({ data: Object.fromEntries(posts) }).send();
}
```

It's a generic in-memory scratch store, not a persistence layer — nothing survives a process restart. See `example/blog-app` (post storage plus a per-post view counter) and `example/todo-app` for it in use, and `lib/server-based.test.js` ("shares provideState/conductState across requests and handlers") for a minimal, storage-free demonstration.

**When composing modules** (see [compose.md](./compose.md)), all composed modules share one default `store` plugin unless a module supplies its own — `composeModules` merges `plugins` too and rejects two modules that register the same plugin `name`, so give each module's own state plugin a distinct name (e.g. `cart`, not `store`) to keep it isolated from other composed modules. Modules that rely on the shared default `store` still need distinct key names across modules you intend to compose together.
