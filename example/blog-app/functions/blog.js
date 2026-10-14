const { PostsStorePlugin } = require('./plugins/blog-store.plugin');
const { CommentsStorePlugin } = require('./plugins/comment-store.plugin');
const { LikesStorePlugin } = require('./plugins/like-store.plugin');

const posts = require('./blog/posts.handlers');
const comments = require('./blog/comments.handlers');
const likes = require('./blog/likes.handlers');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /posts. Its
// handlers are split per entity (blog/posts|comments|likes.handlers.js) but stay one function:
// comments/likes validate their parent post/comment on creation and bump its counts, which
// needs all three stores on the same context. Separate functions would each get isolated
// plugins and have to reach each other over HTTP (see example/time-tracking-app's /reports).

const loggingMiddleware = (req, res, next) => {
  console.log('in logging middleware', req.method, req.originalUrl);
  next();
};

module.exports = {
  handlers: [...posts.handlers, ...comments.handlers, ...likes.handlers],
  middlewares: [loggingMiddleware],
  plugins: [
    { name: 'postsStore', plugin: PostsStorePlugin },
    { name: 'commentsStore', plugin: CommentsStorePlugin },
    { name: 'likesStore', plugin: LikesStorePlugin },
  ],
};
