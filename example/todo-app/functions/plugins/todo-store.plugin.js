// Overrides the default "store" plugin (see lib/plugins/state-store.plugin.js) for this
// function only, seeding the "todos" key at construction time instead of every handler
// lazily falling back to its own seedTodos() on first access. Still a plain Map underneath —
// provideState/conductState keep working unchanged — just pre-populated.
class TodoStorePlugin extends Map {
  constructor() {
    super([['todos', new Map([['1', { title: 't #1', description: 'd #1' }]])]]);
  }
}

module.exports = { TodoStorePlugin };
