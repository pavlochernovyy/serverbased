const { BlogStorePlugin } = require('./plugins/blog-store.plugin');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /posts. Overrides
// the default "store" plugin with BlogStorePlugin (functions/plugins/blog-store.plugin.js),
// pre-seeded with one post — no per-handler seedPosts() fallback needed.
const handlerGetAllPosts = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const posts = context.conductState('posts');

    context.provideReply({ data: Object.fromEntries(posts) }).send();
  },
};

const handlerFindOnePost = {
  route: '/:postId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.conductState('posts');
    const post = posts.get(postId);

    if (!post) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const viewsKey = `views:${postId}`;
    const views = (context.conductState(viewsKey) || 0) + 1;
    context.provideState(viewsKey, views);

    context.provideReply({ data: { ...post, views } }).send();
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

    const posts = context.conductState('posts');
    const postId = `${posts.size + 1}`;
    posts.set(postId, { title, body, author, createdAt: new Date().toISOString() });
    context.provideState('posts', posts);

    context
      .provideReply({
        message: 'post created',
        data: { postId, ...posts.get(postId) },
      })
      .sendWithCode(201);
  },
};

const handlerUpdatePost = {
  route: '/:postId',
  method: 'PUT',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.conductState('posts');
    const existing = posts.get(postId);

    if (!existing) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    const { title, body, author } = context.fetchRequest().body;
    posts.set(postId, {
      title: title ?? existing.title,
      body: body ?? existing.body,
      author: author ?? existing.author,
      createdAt: existing.createdAt,
    });
    context.provideState('posts', posts);

    context.provideReply({ message: 'post updated', data: posts.get(postId) }).send();
  },
};

const handlerDeletePost = {
  route: '/:postId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.conductState('posts');

    if (!posts.has(postId)) {
      context.provideReply({ message: 'post not found' }).sendWithCode(404);
      return;
    }

    posts.delete(postId);
    context.provideState('posts', posts);

    context.provideReply({ message: 'post deleted', data: Object.fromEntries(posts) }).send();
  },
};

const loggingMiddleware = (req, res, next) => {
  console.log('in logging middleware', req.method, req.originalUrl);
  next();
};

module.exports = {
  handlers: [handlerGetAllPosts, handlerFindOnePost, handlerCreatePost, handlerUpdatePost, handlerDeletePost],
  middlewares: [loggingMiddleware],
  plugins: [{ name: 'store', plugin: BlogStorePlugin }],
};
