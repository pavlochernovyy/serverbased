// Default "store" plugin — a Map already exposes get/set, exactly what provideState/conductState
// need. Subclassed only to ignore the `{ dataDir }` argument run() passes to every plugin (a plain
// Map would try to read it as initial entries and throw). Used by
// server-based.js's run() only when the caller hasn't supplied their own
// plugin named "store", keeping context.provideState/conductState working
// unchanged for callers who never touch the plugin system.
class StateStorePlugin extends Map {
  constructor() {
    super();
  }
}

const createStateStorePlugin = () => ({ name: 'store', plugin: StateStorePlugin });

module.exports = { createStateStorePlugin };
