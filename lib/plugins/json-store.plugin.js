const fs = require('fs');
const path = require('path');

// Wraps a Map with JSON-file persistence in `<dataDir>/<name>.json` — `dataDir` is always the
// "data" folder next to serverbased.json, passed in by run() (lib/server-based.js), and the file
// is named after the plugin by convention. Loads existing entries at construction (falling back
// to `seedEntries` when the file doesn't exist yet or holds an empty collection — e.g. first
// run, or every entry was deleted), then writes the whole collection back to disk on every
// set/delete.
// Write-through, not batched: favors "never lose a write" over raw throughput, which is the
// right trade at example-app scale. `name` is the key the instance is exposed under on
// context (see lib/context.provider.js), same convention as the default "store" plugin
// (lib/plugins/state-store.plugin.js).
const createJsonStorePlugin = (name, seedEntries = []) => {
  class JsonStorePlugin extends Map {
    constructor({ dataDir }) {
      // Entries are loaded after super() rather than passed to it: Map's constructor would call
      // the overridden set() below before `this.filePath` exists.
      super();
      this.filePath = path.join(dataDir, `${name}.json`);
      const loaded = fs.existsSync(this.filePath) ? loadFromDisk(this.filePath) : [];

      for (const [key, value] of loaded.length > 0 ? loaded : seedEntries) {
        super.set(key, value);
      }
      if (loaded.length === 0) {
        persistToDisk(this.filePath, this);
      }
    }

    // Next id derived from the data itself — highest numeric suffix among existing keys + 1,
    // e.g. keys "c1", "c3" with prefix "c" → "c4". Unlike `size + 1`, never hands out an id
    // that is still in use after a delete, and stays in sync with whatever was loaded/seeded.
    nextId(prefix = '') {
      let max = 0;
      for (const key of this.keys()) {
        if (!key.startsWith(prefix)) continue;
        const numeric = Number(key.slice(prefix.length));
        if (Number.isInteger(numeric) && numeric > max) max = numeric;
      }
      return `${prefix}${max + 1}`;
    }

    set(key, value) {
      super.set(key, value);
      persistToDisk(this.filePath, this);
      return this;
    }

    delete(key) {
      const deleted = super.delete(key);
      if (deleted) persistToDisk(this.filePath, this);
      return deleted;
    }
  }

  return { name, plugin: JsonStorePlugin };
};

function loadFromDisk(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return raw ? Object.entries(JSON.parse(raw)) : [];
}

// A missing "data" folder or file is fine: the folder is created first, then the file. The
// constructor relies on this to seed a fresh store on first run.
function persistToDisk(filePath, map) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(map), null, 2));
}

module.exports = { createJsonStorePlugin };
