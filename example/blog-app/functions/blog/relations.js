// Read-side helpers shared by the posts/comments/likes handlers. Every relation is a flat id
// field (`comment.postId`, `like.postId`/`like.commentId`) validated at creation time, so
// building the chain back on read is just a filter over each store — no extra checks needed.
const commentsOf = (context, postId) =>
  [...context.commentsStore.entries()]
    .filter(([, comment]) => comment.postId === postId)
    .map(([commentId, comment]) => ({ commentId, ...comment }));

const postLikesOf = (context, postId) =>
  [...context.likesStore.entries()]
    .filter(([, like]) => like.postId === postId && like.commentId === null)
    .map(([likeId, like]) => ({ likeId, ...like }));

const commentLikesOf = (context, commentId) =>
  [...context.likesStore.entries()]
    .filter(([, like]) => like.commentId === commentId)
    .map(([likeId, like]) => ({ likeId, ...like }));

// Resolves `:commentId` only when it exists *and* belongs to `:postId` — the same check guards
// creating and listing comment likes.
const findCommentOfPost = (context, postId, commentId) => {
  const comment = context.commentsStore.get(commentId);
  return comment && comment.postId === postId ? comment : undefined;
};

module.exports = { commentsOf, postLikesOf, commentLikesOf, findCommentOfPost };
