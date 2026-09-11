# blog-app example — state

## What it is

A CRUD blog API built on `server-based`'s config-driven function registry, modeled after
`example/todo-app` — same shape: a single config-loaded function (`functions/blog.js`, mounted
at `/posts` via `serverbased.json`), `handlerType: 'context'`, one function-scoped logging
middleware, storage via the framework's `provideState`/`conductState`. No auth.

## File layout

```
example/blog-app/
  serverbased.json          # lists the "blog" function → functions/blog.js, route /posts
  functions/
    blog.js                 # the 5 CRUD handlers, loggingMiddleware, own "store" plugin
    plugins/
      blog-store.plugin.js  # BlogStorePlugin — seeds the "posts" key at construction
  index.js                  # thin entrypoint: serverBased({ configPath }).run()
  blog-app.test.js
```

Migrated (2026-09-11) from a standalone `serverBased({ handlers, middlewares }).run()` app to
this config-driven shape — see `docs/drafts/config-only-composition.task.md` in the package root
for the migration record. Route URLs are unchanged by the migration.

## Endpoints

| Method | Route            | Behavior                                              |
|--------|------------------|--------------------------------------------------------|
| GET    | `/posts`         | list all posts                                          |
| GET    | `/posts/:postId` | fetch one post (and increment its view count), `404` if missing |
| POST   | `/posts`         | create a post, `400` if `title`/`body` missing, `201` on success |
| PUT    | `/posts/:postId` | partial update, `404` if missing, keeps `createdAt`        |
| DELETE | `/posts/:postId` | delete, `404` if missing                                  |

Storage: `context.conductState('posts')` — a `Map<postId, {title, body, author, createdAt}>`.
Seeded with one post at construction time by `BlogStorePlugin` (`functions/plugins/blog-store.plugin.js`),
which overrides the framework's default `store` plugin for this function only — no more
`context.conductState('posts') || seedPosts()` fallback in every handler; `conductState('posts')`
always returns the pre-seeded `Map`. A fresh, independently-seeded instance is created per
`run()` call, isolated from every other function's store (see `blog-app.test.js`, "each run()
gets its own seeded BlogStorePlugin instance"). Post ids are `posts.size + 1` as a string,
computed inline in the create handler — fine for a linear demo, breaks under concurrent creates
or after any delete (id reuse/collision). View counts live under a separate key per post
(`views:<postId>`) in the same store — deliberately left *unseeded*, lazily initialized to `0` on
first view, since (unlike `posts`) there's no meaningful value to seed it with in advance.

All endpoints manually verified with `curl` (list/get/create/update/delete/404/400),
and covered by `blog-app.test.js`.

## What the framework already covers well

- Declarative handler registration (`route`/`method`/`run`/`handlerType`) — writing
  5 CRUD handlers was mechanical, no boilerplate Express wiring needed.
- `ContextProvider.fetchRequest().{params,body,query}` — enough for typical REST CRUD
  input.
- `provideReply().send()` / `.sendWithCode()` — clean enough for success + validation-
  error responses (400/404/201).
- `provideState(key, value)` / `conductState(key)` — the function-scoped `Map` behind these
  now backs all of this example's storage (posts and per-post view counts), no
  hand-rolled module-level storage object needed.
- Overriding the default `store` plugin (`{ name: 'store', plugin: BlogStorePlugin }`) — lets
  the app seed its own initial state at construction time instead of every handler carrying its
  own lazy-seed fallback logic.
- `runtimeErrorHandlingMiddleware` — malformed JSON bodies and thrown/rejected errors
  from `context` handlers get a shaped JSON error response, not an HTML stack trace
  (see `blog-app.test.js`, "malformed JSON request body").
- A function's own scoped `middlewares` — trivial to add request logging without it leaking
  onto any other function's routes.

## Gaps this example exposed (candidates for the framework to grow into)

1. **No real persistence, still.** `provideState`/`conductState` replaced the hand-rolled
   `Map`, but it's in-memory scratch state scoped to one running app instance — nothing
   survives a process restart, and there's still no `lib/`-level store/repository concept
   (SQLite, JSON-db, etc.) for apps that need actual durability.

2. **No input validation layer.** The blog app manually checks `if (!title || !body)` in the handler. There's no schema/shape declaration (mentioned as an ambition in `docs/purpose.txt` — yml-driven handler generation) that the framework enforces before `run()` is even called.

3. **No content-type/rendering abstraction.** `provideReply().send()` always calls Express's `res.send`, which content-type-sniffs based on the payload type. A blog naturally wants at least "render as markdown/HTML" (see `example/markdown-app`, which calls `json2md` directly in the handler rather than through any framework hook) — there's no shared rendering step.

4. **No pagination / query filtering support.** `GET /posts` returns the entire `Map` unconditionally — fine for a demo, but the framework offers no query-param handling convention beyond raw `fetchRequest().query` access (already used in markdown-app), so paging is entirely on the app author.

5. **No slugs/friendly URLs.** IDs are sequential numeric strings; a blog would typically want slug-based routes, which is purely an app-level decision today (framework has no opinion either way — this may be fine, but worth naming explicitly given the "framework" ambition).

6. **`conductState`/`provideState` have no namespacing convention *within* a function.** Every handler picks its own key string (`'posts'`, `` `views:${postId}` ``) by hand; nothing stops two unrelated handlers *in the same function* from colliding on the same key. (Cross-function collisions are no longer possible — each function gets its own isolated `store` plugin instance, see the config-only-composition migration — but that isolation boundary is per-function, not per-handler.)

## Deliberately out of scope for this pass

- Authentication/authorization (explicitly excluded per the task — the IAM/role notes in `docs/purpose.txt` remain future work).
- Persistent storage (DB) — kept in-memory to match the existing examples' style.
