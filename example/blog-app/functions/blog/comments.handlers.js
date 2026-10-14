const { commentsOf } = require('./relations');

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

    context.provideReply({ data: commentsOf(context, postId) }).send();
  },
};

// Validates the post on creation and bumps its `commentsCount`, so the count is readable from
// the post itself without listing comments.
const handlerCreateComment = {
  route: '/:postId/comments',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const post = context.postsStore.get(postId);

    if (!post) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const { body, author } = context.fetchRequest().body;
    if (!body) {
      context.provideReply({ message: 'body is required' }).sendWithCode(400);
      return;
    }

    const commentId = context.commentsStore.nextId('c');
    const comment = { postId, body, author, createdAt: new Date().toISOString(), likesCount: 0 };
    context.commentsStore.set(commentId, comment);
    context.postsStore.set(postId, { ...post, commentsCount: (post.commentsCount || 0) + 1 });

    context.provideReply({ message: 'comment created', data: { commentId, ...comment } }).sendWithCode(201);
  },
};

module.exports = { handlers: [handlerListComments, handlerCreateComment] };
