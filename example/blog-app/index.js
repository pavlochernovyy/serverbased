const { serverBased } = require('../../lib/server-based');

const seedPosts = () =>
  new Map([
    ['1', { title: 'first post', body: 'hello, blog', author: 'pavlo', createdAt: '2026-09-01T00:00:00.000Z' }],
  ]);

const handlerGetAllPosts = {
  route: '/posts',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const posts = context.conductState('posts') || seedPosts();
    context.provideState('posts', posts);

    context.provideReply({ data: Object.fromEntries(posts) }).send();
  },
};

const handlerFindOnePost = {
  route: '/posts/:postId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.conductState('posts') || seedPosts();
    context.provideState('posts', posts);
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
  route: '/posts',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { title, body, author } = context.fetchRequest().body;

    if (!title || !body) {
      context.provideReply({ message: 'title and body are required' }).sendWithCode(400);
      return;
    }

    const posts = context.conductState('posts') || seedPosts();
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
  route: '/posts/:postId',
  method: 'PUT',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.conductState('posts') || seedPosts();
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
  route: '/posts/:postId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { postId } = context.fetchRequest().params;
    const posts = context.conductState('posts') || seedPosts();

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

const handlers = [handlerGetAllPosts, handlerFindOnePost, handlerCreatePost, handlerUpdatePost, handlerDeletePost];
const middlewares = [loggingMiddleware];

if (require.main === module) {
  serverBased({
    title: 'blog app',
    purpose: 'http api',
    version: '1.0',
    middlewares,
    handlers,
  }).run();
}

module.exports = { handlers, middlewares };
