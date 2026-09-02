# Open items

← [index](./README.md)

From `docs/audit.txt` and recent design conversations:

- **Validation layer** — explored and drafted (presence-only `validateAgainstSchema`), then explicitly declined for now as too complex for the project's current scale. Not implemented.
- **Mounting composed modules via `app.use(prefix, router)`** instead of flat-merging handlers — discussed as a POC idea (route namespacing "for free", middleware scoped per mount instead of global), postponed. Current composition strategy remains the flat `composeModules` merge — see [compose.md](./compose.md).
- **Lambda / multi-target deploy** — not started. The `context`-based handler model is considered a good foundation for this (handler logic doesn't touch Express directly), but `run()` is still hardwired to `app.listen`; `runningMode`/`routerEngine` enums exist but are unused stubs.
- **Per-module state/middleware isolation** — not started; flagged in [compose.md](./compose.md) as the main sharp edge of the current composition model.
