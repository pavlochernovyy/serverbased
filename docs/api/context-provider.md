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
| `provideState(key, value)`       | `this` (chainable)   | writes `value` under `key` into the app's shared `stateStore` (a `Map`) |
| `conductState(key)`              | `any`                | reads `value` back for `key` from the shared `stateStore`; `undefined` if never set |

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

## State (`provideState`/`conductState`)

`serverBased.run()` creates one `stateStore` (a plain `Map`) per app instance and passes it into every `context`-type handler's `ContextProvider` (see `stateStore` in `server-based.js`). This makes `provideState`/`conductState` a lightweight, app-scoped key/value store, shared by every handler and every request of that app instance — but isolated from any other `serverBased()` instance (e.g. different apps, or different test servers).

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

**When composing modules** (see [compose.md](./compose.md)), all composed modules share one `stateStore` — there is no per-module namespacing. Pick distinct key names across modules you intend to compose together.
