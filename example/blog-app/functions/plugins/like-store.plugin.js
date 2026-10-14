const { createJsonStorePlugin } = require('../../../../lib/plugins/json-store.plugin');
const { likeSeeds } = require('./seeds');

// Exposed on context as `likesStore` — a JSON-backed Map, seeded (see ./seeds.js) whenever
// data/likesStore.json is missing or empty, persisted on every write. Each entry is
// `{ postId, commentId, createdAt }`: `commentId` is `null` for a like on a post itself, or set
// for a like on a comment — both reference their target by plain id, same convention as
// comment-store.plugin.js.
const LikesStorePlugin = createJsonStorePlugin('likesStore', likeSeeds).plugin;

module.exports = { LikesStorePlugin };
