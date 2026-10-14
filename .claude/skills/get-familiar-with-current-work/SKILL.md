---
name: get-familiar-with-current-work
description: Read every doc in this package's docs folder to get familiar with the current state and work process of server-based, then give the user a brief status summary based on the newest upcoming idea — was it implemented, what was parked recently, what to work on next. Use at the start of a working session or when asked to catch up on the current work.
---

1. Read every file under `docs/` (start with `docs/README.md`, which explains what each folder is
   for), plus each `example/*/docs/*.md`:
   - `docs/state/` — what exists and why; `open-items.md` is the list of done/postponed/not-started work;
   - `docs/api/` — the current API surface;
   - `docs/drafts/` — design write-ups (a `*.task.log.md` sibling holds the dated execution log);
   - `docs/park/` — postponed items: the idea, why it was parked, open questions;
   - `docs/upcoming-ideas/` — the user's dated, informal session notes
     (`upcoming-idea.<DD-MM-YYYY>.txt`).
   Read them fully; don't skim file names only. Treat the user's informal notes as their
   thinking, not as finished decisions.

2. Find the **newest** upcoming idea: pick it by the date in the file name, parsed as
   DD-MM-YYYY (not by alphabetical order), and cross-check that its first line reads
   `Plan to discuss (newest):` — older ones are marked `(obsolete)`. If these disagree, say so.

3. Check the newest idea against the docs **and the code** (`lib/`, `example/`, recent
   `git log --oneline -15 -- .`) — for each point it raises, decide: implemented, partly
   implemented, parked, or not started. Back each verdict with where it shows up (file,
   doc section, or commit), not a guess.

4. Give the user a brief summary that fits on one screen:
   - **Current state** — two or three lines on what server-based is right now;
   - **Newest idea (`<date>`)** — was it implemented? Go through its points with a verdict each;
   - **Parked recently** — items in `docs/park/` or marked parked/postponed in `open-items.md`,
     newest first, with one line on why each was parked and whether it is waiting on the
     user (e.g. an empty "Proposed solution" section);
   - **What could be next** — two or three candidates, picked from not-started open items,
     unimplemented points of the newest idea, and parked items that look ready to unblock,
     each with one line on why it is a good next step. Recommend one.

5. Only read and report — don't edit docs, code or notes.
