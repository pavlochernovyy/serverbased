const { createJsonStorePlugin } = require('../../../../lib/plugins/json-store.plugin');
const { postSeeds } = require('./seeds');

// Overrides the default "store" plugin (see lib/plugins/state-store.plugin.js) for this
// function only, backed by data/postsStore.json (the "data" folder next to serverbased.json,
// file named after the plugin) so posts survive a process restart — see
// lib/plugins/json-store.plugin.js. Seeded (see ./seeds.js) whenever the file is missing or
// empty; otherwise the file is the source of truth. Exposed on context as `postsStore` (not the
// default `store`) — see functions/blog.js — so it reads unambiguously next to
// `commentsStore`/`likesStore`.
const PostsStorePlugin = createJsonStorePlugin('postsStore', postSeeds).plugin;

module.exports = { PostsStorePlugin };
