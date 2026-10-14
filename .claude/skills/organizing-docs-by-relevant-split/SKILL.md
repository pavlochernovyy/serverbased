Applies only to `docs/drafts/*.task.md` design docs that accumulate execution history over
multiple work sessions (resolutions, migrations, follow-ups, "Decision N landed" write-ups) —
this is the one place in `docs/` that grows as a diary across sessions. It does **not** apply to
`docs/state/*.md` or `docs/api/*.md` (reference/index docs — brief dated annotations like
"removed 2026-09-11" woven into current-state prose are fine there, not a log) or `docs/park/*.md`
(single-topic write-ups with one resolution note, not a repeating multi-entry log). A short
one-shot `docs/drafts/*.task.md` that never grows a history (e.g. `function-registry.task.md`)
also doesn't need it — see step 4.

1. Keep `<name>.task.md` limited to design/decision content only: Goal, source quote/context,
   "Decisions locked in", Solution draft (describing the final/current shape, not a status-
   tracked TODO list), "Explicitly out of scope", Open questions, and the raw answers to them.
   No dated "done (YYYY-MM-DD)" entries, no "Resolution —"/"Follow-up —"/"Migration log" sections
   in this file.
2. Put every dated log entry — resolutions, per-item migrations, follow-up fixes, "Decision N
   landed" summaries — in a sibling file named `<name>.task.log.md`, in chronological order.
   Start that file with one line linking back to the design doc.
3. In the design doc, replace anything that would otherwise be a log entry with a short pointer
   into the log (e.g. "Execution details: see `<name>.task.log.md#<anchor>`"), and end the design
   doc with a `## Status` section summarizing what's done and linking to the log for the full
   trail.
4. Only do this split once the draft actually starts accumulating log content — a short, one-shot
   design doc that never grows a history doesn't need a sibling log file. Retrofit the split
   (like `config-only-composition.task.md`/`.task.log.md`) once it does.
5. Never rewrite past log entries to "fix" them in place — append corrections/follow-ups as new
   dated entries instead, same as the rest of `docs/` treats history (see `docs/park/*.md`).
