const { PostsStorePlugin } = require('./plugins/blog-store.plugin');
const { CommentsStorePlugin } = require('./plugins/comment-store.plugin');
const { LikesStorePlugin } = require('./plugins/like-store.plugin');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /posts. Overrides
// the default "store" plugin with PostsStorePlugin (functions/plugins/blog-store.plugin.js),
// pre-seeded with one post — no per-handler seedPosts() fallback needed.
//
// Handlers read/write `context.postsStore` directly (a JSON-backed Map, see
// plugins/blog-store.plugin.js) rather than going through provideState/conductState: those
// wrappers hard-code a single `this.store.get/set(key)` pair, which only works for a *flat*
// collection. Posts used to live nested one level down (`store.get('posts')` → another Map)
// — that breaks JSON persistence, since `JSON.stringify` can't serialize a Map nested inside
// another Map's values. Keeping `postsStore` itself as the flat posts-by-id collection (same
// shape commentsStore/likesStore use) avoids that problem entirely.
const handlerGetAllPosts = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    context.provideReply({ data: Object.fromEntries(context.postsStore) }).send();
  },
};

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

    context.provideReply({ data: updated }).send();
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
    const postId = `${posts.size + 1}`;
    const post = { title, body, author, createdAt: new Date().toISOString() };
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

    context.provideReply({ message: 'post deleted', data: Object.fromEntries(posts) }).send();
  },
};

// Comments and likes reference their target by plain id (postId / commentId) — flat foreign
// keys, no graph syntax. Both stores are JSON-backed (see plugins/comment-store.plugin.js,
// plugins/like-store.plugin.js) so they survive a restart just like posts do.
const handlerListComments = {
  route: '/:postId/comments',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;

    if (!context.postsStore.has(postId)) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const comments = [...context.commentsStore.entries()]
      .filter(([, comment]) => comment.postId === postId)
      .map(([commentId, comment]) => ({ commentId, ...comment }));

    context.provideReply({ data: comments }).send();
  },
};

const handlerCreateComment = {
  route: '/:postId/comments',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;

    if (!context.postsStore.has(postId)) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const { body, author } = context.fetchRequest().body;
    if (!body) {
      context.provideReply({ message: 'body is required' }).sendWithCode(400);
      return;
    }

    const commentId = `c${context.commentsStore.size + 1}`;
    const comment = { postId, body, author, createdAt: new Date().toISOString() };
    context.commentsStore.set(commentId, comment);

    context.provideReply({ message: 'comment created', data: { commentId, ...comment } }).sendWithCode(201);
  },
};

const handlerLikePost = {
  route: '/:postId/likes',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;

    if (!context.postsStore.has(postId)) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const likeId = `l${context.likesStore.size + 1}`;
    const like = { postId, commentId: null, createdAt: new Date().toISOString() };
    context.likesStore.set(likeId, like);

    context.provideReply({ message: 'post liked', data: { likeId, ...like } }).sendWithCode(201);
  },
};

const handlerListPostLikes = {
  route: '/:postId/likes',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const likes = [...context.likesStore.entries()]
      .filter(([, like]) => like.postId === postId && like.commentId === null)
      .map(([likeId, like]) => ({ likeId, ...like }));

    context.provideReply({ data: likes }).send();
  },
};

const handlerLikeComment = {
  route: '/:postId/comments/:commentId/likes',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { postId, commentId } = context.fetchRequest().params;
    const comment = context.commentsStore.get(commentId);

    if (!comment || comment.postId !== postId) {
      context.provideReply({ message: 'comment not found' }).sendWithCode(404);
      return;
    }

    const likeId = `l${context.likesStore.size + 1}`;
    const like = { postId, commentId, createdAt: new Date().toISOString() };
    context.likesStore.set(likeId, like);

    context.provideReply({ message: 'comment liked', data: { likeId, ...like } }).sendWithCode(201);
  },
};

const handlerListCommentLikes = {
  route: '/:postId/comments/:commentId/likes',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { commentId } = context.fetchRequest().params;
    const likes = [...context.likesStore.entries()]
      .filter(([, like]) => like.commentId === commentId)
      .map(([likeId, like]) => ({ likeId, ...like }));

    context.provideReply({ data: likes }).send();
  },
};

const loggingMiddleware = (req, res, next) => {
  console.log('in logging middleware', req.method, req.originalUrl);
  next();
};

module.exports = {
  handlers: [
    handlerGetAllPosts,
    handlerFindOnePost,
    handlerCreatePost,
    handlerUpdatePost,
    handlerDeletePost,
    handlerListComments,
    handlerCreateComment,
    handlerLikePost,
    handlerListPostLikes,
    handlerLikeComment,
    handlerListCommentLikes,
  ],
  middlewares: [loggingMiddleware],
  plugins: [
    { name: 'postsStore', plugin: PostsStorePlugin },
    { name: 'commentsStore', plugin: CommentsStorePlugin },
    { name: 'likesStore', plugin: LikesStorePlugin },
  ],
};
