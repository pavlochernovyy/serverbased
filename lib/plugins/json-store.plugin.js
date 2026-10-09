const fs = require('fs');
const path = require('path');

// Wraps a Map with JSON-file persistence: loads existing entries from `filePath` at
// construction (falling back to `seedEntries` only when the file doesn't exist yet — e.g.
// first run), then writes the whole collection back to disk on every set/delete.
// Write-through, not batched: favors "never lose a write" over raw throughput, which is the
// right trade at example-app scale. `name` is the key the instance is exposed under on
// context (see lib/context.provider.js), same convention as the default "store" plugin
// (lib/plugins/state-store.plugin.js).
const createJsonStorePlugin = (name, filePath, seedEntries = []) => {
  class JsonStorePlugin extends Map {
    constructor() {
      const fileExists = fs.existsSync(filePath);

      //okay, cool way to load and transform the data to Map!..
      super(fileExists ? loadFromDisk(filePath) : seedEntries);
      if (!fileExists) {
        persistToDisk(filePath, this);
      }
    }

    set(key, value) {
      super.set(key, value);
      persistToDisk(filePath, this);
      return this;
    }

    delete(key) {
      const deleted = super.delete(key);
      if (deleted) persistToDisk(filePath, this);
      return deleted;
    }
  }

  return { name, plugin: JsonStorePlugin };
};

function loadFromDisk(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return raw ? Object.entries(JSON.parse(raw)) : [];
}

function persistToDisk(filePath, map) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(map), null, 2));
}

module.exports = { createJsonStorePlugin };
