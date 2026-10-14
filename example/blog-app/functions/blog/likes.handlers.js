const { postLikesOf, commentLikesOf, findCommentOfPost } = require('./relations');

// Validates the post on creation and bumps its `likesCount` (post-level likes only).
const handlerLikePost = {
  route: '/:postId/likes',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const post = context.postsStore.get(postId);

    if (!post) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const likeId = context.likesStore.nextId('l');
    const like = { postId, commentId: null, createdAt: new Date().toISOString() };
    context.likesStore.set(likeId, like);
    context.postsStore.set(postId, { ...post, likesCount: (post.likesCount || 0) + 1 });

    context.provideReply({ message: 'post liked', data: { likeId, ...like } }).sendWithCode(201);
  },
};

const handlerListPostLikes = {
  route: '/:postId/likes',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;

    if (!context.postsStore.has(postId)) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    context.provideReply({ data: postLikesOf(context, postId) }).send();
  },
};

// Validates the comment (and that it belongs to the post) on creation, bumps its `likesCount`.
const handlerLikeComment = {
  route: '/:postId/comments/:commentId/likes',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { postId, commentId } = context.fetchRequest().params;
    const comment = findCommentOfPost(context, postId, commentId);

    if (!comment) {
      context.provideReply({ message: 'comment not found' }).sendWithCode(404);
      return;
    }

    const likeId = context.likesStore.nextId('l');
    const like = { postId, commentId, createdAt: new Date().toISOString() };
    context.likesStore.set(likeId, like);
    context.commentsStore.set(commentId, { ...comment, likesCount: (comment.likesCount || 0) + 1 });

    context.provideReply({ message: 'comment liked', data: { likeId, ...like } }).sendWithCode(201);
  },
};

const handlerListCommentLikes = {
  route: '/:postId/comments/:commentId/likes',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId, commentId } = context.fetchRequest().params;

    if (!findCommentOfPost(context, postId, commentId)) {
      context.provideReply({ message: 'comment not found' }).sendWithCode(404);
      return;
    }

    context.provideReply({ data: commentLikesOf(context, commentId) }).send();
  },
};

module.exports = {
  handlers: [handlerLikePost, handlerListPostLikes, handlerLikeComment, handlerListCommentLikes],
};
