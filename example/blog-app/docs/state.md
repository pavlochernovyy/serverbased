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
    blog.js                     # the registered function: combines the handler modules below,
                                 # loggingMiddleware, three named plugins: postsStore,
                                 # commentsStore, likesStore
    blog/
      posts.handlers.js         # posts CRUD (5 handlers), cascading delete
      comments.handlers.js      # list/create comments (2 handlers)
      likes.handlers.js         # like/list for posts and comments (4 handlers)
      relations.js              # read-side helpers: commentsOf, postLikesOf, commentLikesOf,
                                 # findCommentOfPost
    plugins/
      seeds.js                  # seed entries for all three stores, ids/counts kept in sync
      blog-store.plugin.js      # PostsStorePlugin — JSON-backed, seeds post "p1"
      comment-store.plugin.js   # CommentsStorePlugin — JSON-backed, seeds comment "c1"
      like-store.plugin.js      # LikesStorePlugin — JSON-backed, seeds likes "l1" (post), "l2" (c1)
  data/                         # gitignored — postsStore/commentsStore/likesStore.json, created
                                 # at runtime by the three plugins above (always next to
                                 # serverbased.json, file named after the plugin)
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
| GET    | `/posts`                                   | list all posts (with `commentsCount`/`likesCount`, no related entities) |
| GET    | `/posts/:postId`                           | fetch one post with `comments` (each with its `likes`) and post-level `likes`, increment its view count, `404` if missing |
| POST   | `/posts`                                    | create a post, `400` if `title`/`body` missing, `201` on success |
| PUT    | `/posts/:postId`                           | partial update, `404` if missing, keeps `createdAt` and `views` |
| DELETE | `/posts/:postId`                           | delete, cascading to the post's comments and likes, `404` if missing |
| GET    | `/posts/:postId/comments`                  | list comments on a post, `404` if post missing |
| POST   | `/posts/:postId/comments`                  | create a comment, bump the post's `commentsCount`, `400` if `body` missing, `404` if post missing, `201` on success |
| POST   | `/posts/:postId/likes`                     | like a post, bump its `likesCount`, `404` if post missing, `201` on success |
| GET    | `/posts/:postId/likes`                     | list likes on a post (post-level only, not comment likes), `404` if post missing |
| POST   | `/posts/:postId/comments/:commentId/likes` | like a comment, bump its `likesCount`, `404` if comment missing or not on that post, `201` on success |
| GET    | `/posts/:postId/comments/:commentId/likes` | list likes on a comment, `404` if comment missing or not on that post |

Related entities are validated at **creation** time (a comment/like can only be created against
an existing post/comment), so reading them back is just a filter per store — no read-side checks.
`commentsCount`/`likesCount` (post) and `likesCount` (comment) are denormalized onto the parent at
creation time, so a client can see how much is related without calling the list endpoints; a
post's `likesCount` counts post-level likes only, not likes on its comments.

## Storage

Three named plugins, each a thin wrapper around `lib/plugins/json-store.plugin.js`
(`createJsonStorePlugin(name, seedEntries?)`) — a reusable helper added for this
example, generic enough for any `server-based` app that wants JSON-file persistence. No paths in
app code: the file is always `data/<name>.json` next to `serverbased.json`.

- `postsStore` (`PostsStorePlugin`, `functions/plugins/blog-store.plugin.js`) → `data/postsStore.json`.
- `commentsStore` (`CommentsStorePlugin`, `functions/plugins/comment-store.plugin.js`) →
  `data/commentsStore.json`.
- `likesStore` (`LikesStorePlugin`, `functions/plugins/like-store.plugin.js`) →
  `data/likesStore.json`.

All three seed from `functions/plugins/seeds.js` — post `p1`, comment `c1` on it, post-level like
`l1` and comment like `l2` — kept in one file so the ids they reference and the counts on the
parents stay consistent. Each is a `Map` subclass: loads its JSON file into the `Map` at
construction (falling back to its seed entries when the file doesn't exist yet or is empty —
seeding is per collection, so emptying only one file re-seeds only that one), then re-serializes the *whole* collection to
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

Ids come from `store.nextId(prefix)` (`lib/plugins/json-store.plugin.js`) — the highest existing
id + 1 (`'p2'`, `'c2'`, `'l3'`, ...) — every entity id carries its prefix (`p`/`c`/`l`), none is a bare number, derived from the stored data so it never collides with an
id still in use after a delete or a restart. Deleting the highest post id frees it for reuse, so
`DELETE /posts/:postId` cascades to that post's comments and likes — a recreated post never
inherits the old one's relatives.

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
- `lib/plugins/json-store.plugin.js` — a generic, reusable `createJsonStorePlugin(name,
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

6. **[Partly addressed 2026-10-14] Id collisions.** Was `${store.size + 1}`, colliding after any
   delete. Now `nextId(prefix)` derives ids from the stored data and post deletes cascade, so
   deletes are safe. Still no safety under concurrent creates across processes — fine for a
   single-process demo (handlers are synchronous, so one process never interleaves two creates).

7. **No delete/edit for comments or likes.** Only posts support `PUT`/`DELETE` (post delete
   cascades to its comments/likes); comments and likes are append-only in this pass. Adding a
   comment/like delete would also need to decrement the denormalized counts on its parent.

## Deliberately out of scope for this pass

- Authentication/authorization (explicitly excluded per the task — the IAM/role notes in
  `docs/purpose.txt` remain future work).
- A real database (SQL/NoSQL) — JSON-file-backed `Map`s are a durability step up from pure
  in-memory, not a database.
