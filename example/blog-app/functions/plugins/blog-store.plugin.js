const path = require('path');
const { createJsonStorePlugin } = require('../../../../lib/plugins/json-store.plugin');

// Overrides the default "store" plugin (see lib/plugins/state-store.plugin.js) for this
// function only, backed by a JSON file (../../data/posts.json) so posts survive a process
// restart — see lib/plugins/json-store.plugin.js. Seeded with one post only on first run
// (when the file doesn't exist yet); afterwards the file is the source of truth. Exposed on
// context as `postsStore` (not the default `store`) — see functions/blog.js — so it reads
// unambiguously next to `commentsStore`/`likesStore`.
const PostsStorePlugin = createJsonStorePlugin('postsStore', path.join(__dirname, '../../data/posts.json'), [
  ['1', { title: 'first post', body: 'hello, blog', author: 'pavlo', createdAt: '2026-09-01T00:00:00.000Z' }],
]).plugin;

module.exports = { PostsStorePlugin };
