const { commentsOf, postLikesOf, commentLikesOf } = require('./relations');

// Handlers read/write `context.postsStore` directly (a JSON-backed Map, see
// plugins/blog-store.plugin.js) rather than going through provideState/conductState: those
// wrappers hard-code a single `this.store.get/set(key)` pair, which only works for a *flat*
// collection. Posts used to live nested one level down (`store.get('posts')` → another Map)
// — that breaks JSON persistence, since `JSON.stringify` can't serialize a Map nested inside
// another Map's values. Keeping `postsStore` itself as the flat posts-by-id collection (same
// shape commentsStore/likesStore use) avoids that problem entirely.

// Lists posts only — `commentsCount`/`likesCount` on each post tell how much is related
// without embedding it; the related entities themselves come with GET /posts/:postId.
const handlerGetAllPosts = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    context.provideReply({ data: Object.fromEntries(context.postsStore) }).send();
  },
};

// A single post comes back with its relative entities already: post-level likes, and its
// comments each carrying their own likes.
const handlerFindOnePost = {
  route: '/:postId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.postsStore;
    const post = posts.get(postId);

    if (!post) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const updated = { ...post, views: (post.views || 0) + 1 };
    posts.set(postId, updated);

    const comments = commentsOf(context, postId).map((comment) => ({
      ...comment,
      likes: commentLikesOf(context, comment.commentId),
    }));

    context.provideReply({ data: { postId, ...updated, comments, likes: postLikesOf(context, postId) } }).send();
  },
};

const handlerCreatePost = {
  route: '/',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { title, body, author } = context.fetchRequest().body;

    if (!title || !body) {
      context.provideReply({ message: 'title and body are required' }).sendWithCode(400);
      return;
    }

    const posts = context.postsStore;
    const postId = posts.nextId('p');
    const post = { title, body, author, createdAt: new Date().toISOString(), commentsCount: 0, likesCount: 0 };
    posts.set(postId, post);

    context.provideReply({ message: 'post created', data: { postId, ...post } }).sendWithCode(201);
  },
};

const handlerUpdatePost = {
  route: '/:postId',
  method: 'PUT',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.postsStore;
    const existing = posts.get(postId);

    if (!existing) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const { title, body, author } = context.fetchRequest().body;
    const updated = {
      ...existing,
      title: title ?? existing.title,
      body: body ?? existing.body,
      author: author ?? existing.author,
    };
    posts.set(postId, updated);

    context.provideReply({ message: 'post updated', data: updated }).send();
  },
};

// Cascades to the post's comments and likes (comment likes included — they carry `postId`
// too): ids are derived from the data (`nextId`), so a recreated post may get this id back and
// must not inherit the old post's relative entities.
const handlerDeletePost = {
  route: '/:postId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.postsStore;

    if (!posts.has(postId)) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    posts.delete(postId);
    for (const [commentId, comment] of [...context.commentsStore]) {
      if (comment.postId === postId) context.commentsStore.delete(commentId);
    }
    for (const [likeId, like] of [...context.likesStore]) {
      if (like.postId === postId) context.likesStore.delete(likeId);
    }

    context.provideReply({ message: 'post deleted', data: Object.fromEntries(posts) }).send();
  },
};

module.exports = {
  handlers: [handlerGetAllPosts, handlerFindOnePost, handlerCreatePost, handlerUpdatePost, handlerDeletePost],
};
