// Default "store" plugin — a plain Map already exposes get/set, exactly what
// provideState/conductState need, so no wrapper class is required. Used by
// server-based.js's run() only when the caller hasn't supplied their own
// plugin named "store", keeping context.provideState/conductState working
// unchanged for callers who never touch the plugin system.
const createStateStorePlugin = () => ({ name: 'store', plugin: Map });

module.exports = { createStateStorePlugin };
