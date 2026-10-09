const path = require('path');
const { createJsonStorePlugin } = require('../../../../lib/plugins/json-store.plugin');

// Exposed on context as `commentsStore` (see lib/context.provider.js) — a JSON-backed Map,
// empty on first run, persisted to ../../data/comments.json on every write. Each entry is a
// flat `{ postId, body, author, createdAt }` record referencing its post by id — no graph
// syntax, just a plain foreign key.
const CommentsStorePlugin = createJsonStorePlugin(
  'commentsStore',
  path.join(__dirname, '../../data/comments.json')
).plugin;

module.exports = { CommentsStorePlugin };
