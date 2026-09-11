// Overrides the default "store" plugin (see lib/plugins/state-store.plugin.js) for this
// function only, seeding the "posts" key at construction time — same pattern
// example/todo-app/functions/plugins/todo-store.plugin.js uses. The per-post view counter
// (key "views:<postId>") stays unseeded, lazily initialized to 0 on first read, since it has
// no meaningful value until a post is actually viewed.
class BlogStorePlugin extends Map {
  constructor() {
    super([
      [
        'posts',
        new Map([
          ['1', { title: 'first post', body: 'hello, blog', author: 'pavlo', createdAt: '2026-09-01T00:00:00.000Z' }],
        ]),
      ],
    ]);
  }
}

module.exports = { BlogStorePlugin };
