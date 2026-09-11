// Overrides the default "store" plugin (see lib/plugins/state-store.plugin.js) for this
// function only, seeding the "projects" key at construction time — same pattern
// example/todo-app/functions/plugins/todo-store.plugin.js uses. Scoped seed: an empty Map,
// since there's no starting project to pre-populate — the seed here is about always having
// the key present, not pre-existing data.
class ProjectsStorePlugin extends Map {
  constructor() {
    super([['projects', new Map()]]);
  }
}

module.exports = { ProjectsStorePlugin };
