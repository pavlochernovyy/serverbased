// Overrides the default "store" plugin (see lib/plugins/state-store.plugin.js) for this
// function only, seeding the "entries" key at construction time — same pattern
// example/todo-app/functions/plugins/todo-store.plugin.js uses. Scoped seed: an empty Map,
// since (unlike todo-app's/blog-app's seed data) there's no starting time entry to pre-populate
// — the seed here is about always having the key present, not pre-existing data.
class EntriesStorePlugin extends Map {
  constructor() {
    super([['entries', new Map()]]);
  }
}

module.exports = { EntriesStorePlugin };
