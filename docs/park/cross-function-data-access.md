# Parked: cross-function data access without an HTTP hop

← [open-items](../state/open-items.md) · relates to [core.md](../state/core.md), `example/blog-app/docs/state.md`

> **Parked 2026-10-14.** A solution is in mind but not yet written down — see
> "Proposed solution" below, left for the author to fill in.

## Where this came from

Splitting `example/blog-app` into smaller pieces (2026-10-14) raised the question of making
likes (and comments) their own registered functions instead of one `blog` function. That pass
split the handlers per entity into separate files (`functions/blog/{posts,comments,likes}.handlers.js`)
but kept them **one** function — see `functions/blog.js`. The reason was the cross-function access
problem below, not the code layout.

## Current situation

- Each function gets its own plugin instances (isolated by design — "a function owns its own
  database", see the "functions default to an isolated store" decision in
  [open-items.md](../state/open-items.md)).
- The only sanctioned way for one function to read another's data today is that function's
  public HTTP route — e.g. `example/time-tracking-app`'s `/reports/summary` calling `/entries`,
  `example/mini-store-app`'s `/sale` calling `/cart`.
- The blog's comments/likes handlers need the posts (and comments) store on **creation**: they
  validate that the parent exists and bump its denormalized `commentsCount`/`likesCount`. They
  read the related entities back on `GET /posts/:postId`.

## Why separate functions + HTTP doesn't fit the blog well

- **Extra network hop per write** — every like/comment creation would call the posts function
  over HTTP just to check existence, plus another call to bump the count (a write, so it needs a
  dedicated route the posts function exposes only for that).
- **Side effects on the only read route** — `GET /posts/:postId` increments `views`, so using
  it as an "exists?" check would inflate view counts; a side-effect-free lookup would be one more
  route to add purely for internal use.
- **Not an option: two functions pointing at the same JSON file** — each would hold its own
  in-memory `Map` loaded at startup; writes by one are never seen by the other's `Map`, and each
  write-through overwrites the other's file contents.
- **No atomicity** — "create like + bump count" spans two functions/requests; a failure between
  them leaves the count out of sync.

## Proposed solution

_To be described._

## Open questions

- Does the solution keep functions' stores isolated by default, with sharing as an explicit
  opt-in (declared in `serverbased.json`? on the plugin descriptor?), or change the default?
- Read-only access vs read-write access to another function's data.
- How it interacts with `run()` creating fresh plugin instances per function per `run()` call
  (`lib/server-based.js`).
- Whether `example/time-tracking-app`'s `/reports` → `/entries` and `example/mini-store-app`'s
  `/sale` → `/cart` HTTP calls should move to it too, or stay as the "separate service" example.
