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

`provideState`/`conductState` are a thin wrapper around a plugin named `store` — a `Map`-like object exposing `get`/`set`. When a function doesn't supply its own `store` plugin, `run()` auto-injects a default one (`StateStorePlugin`, a `Map` subclass that only ignores the `{ dataDir }` constructor argument every plugin receives — defined in `lib/plugins/state-store.plugin.js`) per function, per `run()` call — see "Default `store` plugin" in `server-based.js`. This makes `provideState`/`conductState` a lightweight, function-scoped key/value store by default, shared by every handler and every request within that function — but isolated from any other function (even in the same running app) and from any other `serverBased()` instance. Supplying your own `{ name: 'store', plugin: MyStoreClass }` (any class exposing `get`/`set`) overrides the default.

There's no built-in seeding on the default `store` — reading a key that was never set returns `undefined`. Two patterns exist depending on whether there's a meaningful starting value:

- **No starting value to seed** (a counter, an initially-empty collection) — read lazily, falling back inline on first access:

  ```js
  run(context) {
    const posts = context.conductState('posts') || new Map();
    context.provideState('posts', posts);

    context.provideReply({ data: Object.fromEntries(posts) }).send();
  }
  ```

- **A real starting value to seed** — supply your own `store` plugin whose constructor pre-populates the key, so every handler can call `conductState(key)` directly without a fallback (see `example/todo-app`'s `TodoStorePlugin`, `functions/plugins/todo-store.plugin.js`):

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

It's a generic in-memory scratch store, not a persistence layer — nothing survives a process restart. See `example/todo-app` for it in use, and `lib/server-based.test.js` ("shares provideState/conductState across requests and handlers") for a minimal, storage-free demonstration. (`example/blog-app` used to be the `provideState`/`conductState` example too, but has since moved to JSON-file-backed plugins accessed directly — see "Custom persistence" below.)

**Store is per-function, not shared across an app.** Each function gets its own default `store` plugin instance (or its own overridden one) — a function's `provideState`/`conductState` never sees another function's state, even within the same running app, so key names only need to be distinct *within* one function, not across the whole app. See "Function registry" in [server-based.md](./server-based.md#function-registry-configpath).

## Custom persistence (`lib/plugins/json-store.plugin.js`)

`provideState`/`conductState` are purely in-memory and tied to one plugin literally named
`store`. A function that wants its state to survive a process restart — or wants more than one
independent named collection — writes its own plugin instead and reaches it directly as
`context.<name>`, bypassing `provideState`/`conductState` entirely.

`createJsonStorePlugin(name, seedEntries?)` is a reusable helper for exactly that case:
it returns a `{ name, plugin }` descriptor (same shape any plugin descriptor takes) whose
`plugin` is a `Map` subclass persisted to **`<dataDir>/<name>.json`**. Neither part is
configurable: `dataDir` is always the `data` folder next to `serverbased.json` (`run()` passes it
to every plugin as `new Plugin({ dataDir })`, see [server-based.md](./server-based.md#plugins)),
and the file is named after the plugin by convention. It loads that file at construction
(falling back to `seedEntries` when the file doesn't exist yet or holds an empty collection —
the folder and file are created as needed) and re-serializes the whole collection to it on every
`set`/`delete` — write-through, not batched, so no write is ever lost at the cost of rewriting
the full file each time (fine at example-app scale).

It also adds `nextId(prefix = '')`: the highest numeric suffix among existing keys with that
prefix, plus one (`'c1'`, `'c5'` → `nextId('c')` is `'c6'`). Ids derived from the stored data
rather than `size + 1`, so an id still in use is never handed out again after a delete. Deleting
the *highest* id does free it for reuse — anything referencing it should be removed with it (see
`example/blog-app`'s cascading post delete).

```js
const { createJsonStorePlugin } = require('../../../lib/plugins/json-store.plugin');

// persisted to <dir of serverbased.json>/data/postsStore.json
const PostsStorePlugin = createJsonStorePlugin('postsStore', [['p1', { title: 'first post' }]]).plugin;

// module.exports = { handlers: [...], plugins: [{ name: 'postsStore', plugin: PostsStorePlugin }] };

run(context) {
  const postId = context.postsStore.nextId('p'); // 'p2'
  context.postsStore.set(postId, { title: 'new post' });
  context.provideReply({ data: Object.fromEntries(context.postsStore) }).send();
}
```

Each collection stays **flat** (`Map<id, record>`) — cross-collection references are plain id
fields on the record (e.g. a comment's `postId`), not a graph/edge syntax. A `Map` nested inside
another `Map`'s values will not survive `JSON.stringify` (it serializes to `{}`), so a
JSON-backed plugin's own top-level `Map` should always be the actual flat collection, never a
container holding a nested one.

See `example/blog-app` (`postsStore`/`commentsStore`/`likesStore`, three independent JSON-backed
collections on one function) for a full working example, and `lib/plugins/state-store.plugin.js`
for the (non-persistent) default `store` plugin this is an alternative to.
