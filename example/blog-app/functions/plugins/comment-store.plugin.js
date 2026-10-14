const { createJsonStorePlugin } = require('../../../../lib/plugins/json-store.plugin');
const { commentSeeds } = require('./seeds');

// Exposed on context as `commentsStore` (see lib/context.provider.js) — a JSON-backed Map,
// seeded (see ./seeds.js) whenever data/commentsStore.json is missing or empty, persisted on
// every write. Each entry is a flat `{ postId, body, author, createdAt, likesCount }` record
// referencing its post by id — no graph syntax, just a plain foreign key.
const CommentsStorePlugin = createJsonStorePlugin('commentsStore', commentSeeds).plugin;

module.exports = { CommentsStorePlugin };
