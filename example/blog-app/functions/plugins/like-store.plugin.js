const path = require('path');
const { createJsonStorePlugin } = require('../../../../lib/plugins/json-store.plugin');

// Exposed on context as `likesStore` — a JSON-backed Map, empty on first run, persisted to
// ../../data/likes.json on every write. Each entry is `{ postId, commentId, createdAt }`:
// `commentId` is `null` for a like on a post itself, or set for a like on a comment —
// both reference their target by plain id, same convention as comment-store.plugin.js.
const LikesStorePlugin = createJsonStorePlugin('likesStore', path.join(__dirname, '../../data/likes.json')).plugin;

module.exports = { LikesStorePlugin };
