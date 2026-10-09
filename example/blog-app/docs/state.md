# blog-app example — state

## What it is

A blog API (posts, comments, likes) built on `server-based`'s config-driven function registry,
modeled after `example/todo-app` — a single config-loaded function (`functions/blog.js`, mounted
at `/posts` via `serverbased.json`), `handlerType: 'context'`, one function-scoped logging
middleware. No auth. Unlike the other `example/*` apps, storage here is **JSON-file backed**
(survives a process restart) instead of plain in-memory `Map`s — see "Storage" below.

## File layout

```
example/blog-app/
  serverbased.json              # lists the "blog" function → functions/blog.js, route /posts
  functions/
    blog.js                     # 11 handlers (posts CRUD + comments + likes), loggingMiddleware,
                                 # three named plugins: postsStore, commentsStore, likesStore
    plugins/
      blog-store.plugin.js      # PostsStorePlugin — JSON-backed, seeds post "1" on first run
      comment-store.plugin.js   # CommentsStorePlugin — JSON-backed, empty on first run
      like-store.plugin.js      # LikesStorePlugin — JSON-backed, empty on first run
  data/                         # gitignored — posts.json/comments.json/likes.json, created at
                                 # runtime by the three plugins above
  index.js                      # thin entrypoint: serverBased({ configPath }).run()
  blog-app.test.js
```

Migrated (2026-09-11) from a standalone `serverBased({ handlers, middlewares }).run()` app to
this config-driven shape — see `docs/drafts/config-only-composition.task.md` in the package root
for that migration record. Route URLs are unchanged by it. The JSON-persistence rework (this doc)
landed later and is unrelated to that migration.

## Endpoints

| Method | Route                                     | Behavior                                              |
|--------|--------------------------------------------|--------------------------------------------------------|
| GET    | `/posts`                                   | list all posts                                          |
| GET    | `/posts/:postId`                           | fetch one post (and increment its view count), `404` if missing |
| POST   | `/posts`                                    | create a post, `400` if `title`/`body` missing, `201` on success |
| PUT    | `/posts/:postId`                           | partial update, `404` if missing, keeps `createdAt` and `views` |
| DELETE | `/posts/:postId`                           | delete, `404` if missing                                  |
| GET    | `/posts/:postId/comments`                  | list comments on a post, `404` if post missing |
| POST   | `/posts/:postId/comments`                  | create a comment, `400` if `body` missing, `404` if post missing, `201` on success |
| POST   | `/posts/:postId/likes`                     | like a post, `404` if post missing, `201` on success |
| GET    | `/posts/:postId/likes`                     | list likes on a post (post-level only, not comment likes) |
| POST   | `/posts/:postId/comments/:commentId/likes` | like a comment, `404` if comment missing, `201` on success |
| GET    | `/posts/:postId/comments/:commentId/likes` | list likes on a comment |

## Storage

Three named plugins, each a thin wrapper around `lib/plugins/json-store.plugin.js`
(`createJsonStorePlugin(name, filePath, seedEntries?)`) — a reusable helper added for this
example, generic enough for any `server-based` app that wants JSON-file persistence:

- `postsStore` (`PostsStorePlugin`, `functions/plugins/blog-store.plugin.js`) → `data/posts.json`,
  seeded with one post on first run.
- `commentsStore` (`CommentsStorePlugin`, `functions/plugins/comment-store.plugin.js`) →
  `data/comments.json`, empty on first run.
- `likesStore` (`LikesStorePlugin`, `functions/plugins/like-store.plugin.js`) →
  `data/likes.json`, empty on first run.

Each is a `Map` subclass: loads its JSON file into the `Map` at construction (falling back to
seed entries only when the file doesn't exist yet), then re-serializes the *whole* collection to
disk on every `set`/`delete` (write-through, not batched — simplest "never lose a write" option,
fine at this scale). Handlers read/write these directly (`context.postsStore.get(...)`, etc.) —
**not** through `provideState`/`conductState`, which are hard-wired to a single plugin literally
named `store` and only make sense for one flat collection; this app has three. (Because no plugin
here is named `store`, the framework's default `store` plugin — a plain unseeded `Map` — still
gets auto-appended per the usual rule, but nothing references it.)

All three collections are **flat** (`Map<id, record>`) — comments and likes reference their
parent by a plain id field (`comment.postId`, `like.postId`/`like.commentId`), not any graph/edge
syntax. This was a deliberate simplification from an earlier draft that considered a one-line
chain-of-references encoding for "what's newest" — dropped in favor of "flat FK + JSON file is
already enough" (see `docs/upcoming-ideas/upcoming-idea.09-10-2026.txt` for that earlier idea).
Posts also used to live nested one level inside a `store` Map (`store.get('posts')` → another
`Map`) — that broke under `JSON.stringify` (a `Map` nested inside another `Map`'s values
serializes to `{}`), which is why `postsStore` itself is now the flat posts-by-id collection.

Post ids are `postsStore.size + 1` as a string (same for comment ids `c${commentsStore.size + 1}`
and like ids `l${likesStore.size + 1}`), computed inline — fine for a linear demo, breaks under
concurrent creates or after any delete (id reuse/collision); see "Gaps" below.

All endpoints covered by `blog-app.test.js`, including persistence-across-restart for posts and
comments (start a server, write, `closeAsync()`, start a fresh server against the same `data/`
files, confirm the write is still there).

## What the framework already covers well

- Declarative handler registration (`route`/`method`/`run`/`handlerType`) — 11 handlers across
  posts/comments/likes, no boilerplate Express wiring needed.
- `ContextProvider.fetchRequest().{params,body,query}` — enough for typical REST CRUD input.
- `provideReply().send()` / `.sendWithCode()` — clean enough for success + validation-error
  responses (400/404/201).
- Multiple named plugins per function (`postsStore`/`commentsStore`/`likesStore`) — the plugin
  system isn't limited to one `store`-named override; a function can carry as many independent
  named stores as it needs, each reachable as `context.<name>`.
- `lib/plugins/json-store.plugin.js` — a generic, reusable `createJsonStorePlugin(name, filePath,
  seedEntries?)` factory; writing three JSON-backed collections for this app was a one-liner each.
- `runtimeErrorHandlingMiddleware` — malformed JSON bodies and thrown/rejected errors from
  `context` handlers get a shaped JSON error response, not an HTML stack trace (see
  `blog-app.test.js`, "malformed JSON request body").
- A function's own scoped `middlewares` — trivial to add request logging without it leaking onto
  any other function's routes.

## Gaps this example exposed (candidates for the framework to grow into)

1. **[Addressed this pass] No real persistence.** Was: `provideState`/`conductState` were
   in-memory scratch state only, nothing survived a restart, and there was no `lib/`-level
   store/repository concept. Now: `lib/plugins/json-store.plugin.js` gives any plugin JSON-file,
   write-through persistence — demonstrated by all three of this app's stores. Still not a real
   database: no indexing beyond `Map` lookup-by-id, no transactions, no compaction (a long-running
   app's JSON file only grows), and write-through means every single `set` rewrites the *entire*
   collection to disk — fine at demo scale, not at any real volume.

2. **No input validation layer.** Handlers manually check e.g. `if (!title || !body)`. There's no
   schema/shape declaration (mentioned as an ambition in `docs/purpose.txt` — yml-driven handler
   generation) that the framework enforces before `run()` is even called.

3. **No content-type/rendering abstraction.** `provideReply().send()` always calls Express's
   `res.send`, which content-type-sniffs based on the payload type. A blog naturally wants at
   least "render as markdown/HTML" (see `example/markdown-app`, which calls `json2md` directly in
   the handler rather than through any framework hook) — there's no shared rendering step.

4. **No pagination / query filtering support.** `GET /posts` returns the entire collection
   unconditionally — fine for a demo, but the framework offers no query-param handling convention
   beyond raw `fetchRequest().query` access (already used in markdown-app), so paging is entirely
   on the app author.

5. **No slugs/friendly URLs.** IDs are sequential numeric strings; a blog would typically want
   slug-based routes, which is purely an app-level decision today (framework has no opinion either
   way — this may be fine, but worth naming explicitly given the "framework" ambition).

6. **No id-collision safety under concurrent writes.** `${store.size + 1}` for posts/comments/
   likes breaks under concurrent creates or after any delete (id reuse/collision) — acceptable for
   a single-request-at-a-time demo, not for anything real.

7. **No delete/edit for comments or likes.** Only posts support `PUT`/`DELETE`; comments and likes
   are append-only in this pass (matches the "flat FK, no chain syntax" simplification — deleting a
   comment would also orphan any likes referencing it, which this app doesn't address).

## Deliberately out of scope for this pass

- Authentication/authorization (explicitly excluded per the task — the IAM/role notes in
  `docs/purpose.txt` remain future work).
- A real database (SQL/NoSQL) — JSON-file-backed `Map`s are a durability step up from pure
  in-memory, not a database.
