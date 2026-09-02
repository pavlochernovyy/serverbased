# Open items

← [index](./README.md)

From `docs/audit.txt` and recent design conversations:

- **Validation layer** — explored and drafted (presence-only `validateAgainstSchema`), then explicitly declined for now as too complex for the project's current scale. Not implemented.
- **Mounting composed modules via `app.use(prefix, router)`** instead of flat-merging handlers — discussed as a POC idea (route namespacing "for free", middleware scoped per mount instead of global), postponed. Current composition strategy remains the flat `composeModules` merge — see [compose.md](./compose.md).
- **Lambda / multi-target deploy** — not started. The `context`-based handler model is considered a good foundation for this (handler logic doesn't touch Express directly), but `run()` is still hardwired to `app.listen`; `runningMode`/`routerEngine` enums exist but are unused stubs.
- **Per-module state isolation** — done, via the plugin system: named plugins (`{ name, plugin }`) let a module carry its own state instead of relying on the one shared `store` `Map`, and `composeModules` rejects two modules that register the same plugin name. See [core.md](./core.md) ("Plugin system"), [compose.md](./compose.md), and `example/combined-mini-store-blog` for it proven end-to-end (`mini-store`'s named `cart`/`sale` plugins composed alongside `blog-app`'s default `store` plugin).
- **Per-module middleware isolation** — still not started; global `middlewares` remain unscoped across composed modules (see [compose.md](./compose.md)). The "mounting via `app.use(prefix, router)`" idea above is the most likely path to this, since a per-mount router would scope both routes and middleware together.
- **Plugin constructor arguments** — not started. `run()` always instantiates a plugin as `new Plugin()` with no arguments; a plugin that wants configuration (e.g. `SalePlugin`'s bulk-discount threshold/rate, currently hardcoded constants in `example/mini-store/sale.plugin.js`) has no way to receive it from `serverBased()`'s config today.
