---
name: prepare-commit-message
description: Summarize what the current commit does and suggest a commit message in this project's `[server-based]: ...;` style. Use when asked to prepare, formulate or suggest a commit message.
---

1. Determine what "the current commit" is:
   - if there are uncommitted changes under this package (staged, unstaged or untracked — check
     `git status --short .`), it's those — the commit about to be made; point out any change
     that is unstaged/untracked and would be left out unless added;
   - otherwise it's the last commit (`git show --stat HEAD`).
   Read the actual diff (`git diff HEAD -- .` plus untracked files), not just file names.

2. Write a short summary of what was done, grouped by area — e.g. **Framework (`lib/`)**,
   **<example app name>**, **Docs**, **Clean-up** — one bullet per meaningful change, saying
   *what changed* and, where not obvious, *why*. Skip groups with nothing in them. Mention
   changes the user made themselves (notes files, renames) too, so nothing in the commit is a
   surprise. Keep it to what fits on one screen.

3. After the summary, suggest a commit message in the style of this package's history
   (`git log --format=%s -10 -- .` to confirm it hasn't changed):
   - single line, prefixed with `[server-based]: `;
   - lowercase, imperative clauses (`add ...`, `split ...`, `remove ...`, `migrate ...`,
     `rename ... to ...`), several clauses separated by `; `;
   - ends with `;`;
   - no body, no attribution trailer.
   Example: `[server-based]: split blog-app handlers per entity; add related entities and counts; store data in data/<plugin>.json next to serverbased.json;`

4. Do not stage or commit anything — only provide the summary and the suggested message.
