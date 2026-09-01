# blog-app example — state

## What it is

A CRUD blog API built directly on `server-based`, modeled after `example/todo-app` —
same shape: `handlerType: 'context'`, one global logging middleware, storage via the
framework's `provideState`/`conductState`. No auth.

## Endpoints

| Method | Route            | Behavior                                              |
|--------|------------------|--------------------------------------------------------|
| GET    | `/posts`         | list all posts                                          |
| GET    | `/posts/:postId` | fetch one post (and increment its view count), `404` if missing |
| POST   | `/posts`         | create a post, `400` if `title`/`body` missing, `201` on success |
| PUT    | `/posts/:postId` | partial update, `404` if missing, keeps `createdAt`        |
| DELETE | `/posts/:postId` | delete, `404` if missing                                  |

Storage: `context.conductState('posts')` — a `Map<postId, {title, body, author, createdAt}>`,
lazily seeded with one post (`seedPosts()`) on first access, held in `server-based`'s
per-app-instance `stateStore`. Post ids are `posts.size + 1` as a string, computed
inline in the create handler — fine for a linear demo, breaks under concurrent creates
or after any delete (id reuse/collision). View counts live under a separate key per
post (`views:<postId>`) in the same store.

All endpoints manually verified with `curl` (list/get/create/update/delete/404/400),
and covered by `blog-app.test.js`.

## What the framework already covers well

- Declarative handler registration (`route`/`method`/`run`/`handlerType`) — writing
  5 CRUD handlers was mechanical, no boilerplate Express wiring needed.
- `ContextProvider.fetchRequest().{params,body,query}` — enough for typical REST CRUD
  input.
- `provideReply().send()` / `.sendWithCode()` — clean enough for success + validation-
  error responses (400/404/201).
- `provideState(key, value)` / `conductState(key)` — the app-scoped `Map` behind these
  now backs all of this example's storage (posts and per-post view counts), no
  hand-rolled module-level storage object needed.
- `runtimeErrorHandlingMiddleware` — malformed JSON bodies and thrown/rejected errors
  from `context` handlers get a shaped JSON error response, not an HTML stack trace
  (see `blog-app.test.js`, "malformed JSON request body").
- Global middleware — trivial to add request logging.

## Gaps this example exposed (candidates for the framework to grow into)

1. **No real persistence, still.** `provideState`/`conductState` replaced the hand-rolled
   `Map`, but it's in-memory scratch state scoped to one running app instance — nothing
   survives a process restart, and there's still no `lib/`-level store/repository concept
   (SQLite, JSON-db, etc.) for apps that need actual durability.

2. **No input validation layer.** The blog app manually checks `if (!title || !body)` in the handler. There's no schema/shape declaration (mentioned as an ambition in `docs/purpose.txt` — yml-driven handler generation) that the framework enforces before `run()` is even called.

3. **No content-type/rendering abstraction.** `provideReply().send()` always calls Express's `res.send`, which content-type-sniffs based on the payload type. A blog naturally wants at least "render as markdown/HTML" (see `example/markdown-app`, which calls `json2md` directly in the handler rather than through any framework hook) — there's no shared rendering step.

4. **No pagination / query filtering support.** `GET /posts` returns the entire `Map` unconditionally — fine for a demo, but the framework offers no query-param handling convention beyond raw `fetchRequest().query` access (already used in markdown-app), so paging is entirely on the app author.

5. **No slugs/friendly URLs.** IDs are sequential numeric strings; a blog would typically want slug-based routes, which is purely an app-level decision today (framework has no opinion either way — this may be fine, but worth naming explicitly given the "framework" ambition).

6. **`conductState`/`provideState` have no namespacing convention.** Every handler picks its own key string (`'posts'`, `` `views:${postId}` ``) by hand; nothing stops two unrelated handlers from colliding on the same key in a bigger app.

## Deliberately out of scope for this pass

- Authentication/authorization (explicitly excluded per the task — the IAM/role notes in `docs/purpose.txt` remain future work).
- Persistent storage (DB) — kept in-memory to match the existing examples' style.
