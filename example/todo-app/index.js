const { serverBased } = require('../../lib/server-based');

const seedTodos = () => new Map([['1', { title: 't #1', description: 'd #1' }]]);

const handlerGetAllTodos = {
  route: '/todo',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const todos = context.conductState('todos') || seedTodos();
    context.provideState('todos', todos);

    context.provideReply({ data: Object.fromEntries(todos) }).send();
  },
};

const handlerFindOneTodo = {
  route: '/todo/:todoId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    const todos = context.conductState('todos') || seedTodos();
    context.provideState('todos', todos);

    context.provideReply({ data: todos.get(todoId) || {} }).send();
  },
};

const handlerSubmitOneTodo = {
  route: '/todo',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, title, description } = context.fetchRequest().body;
    const todos = context.conductState('todos') || seedTodos();
    const todoId = `${id}`;
    const result = todos.set(todoId, { title, description });
    context.provideState('todos', todos);

    const posted = result.has(todoId);
    context
      .provideReply({
        message: posted ? 'todo created' : 'todo is not created',
      })
      .sendWithCode(201);
  },
};

const handlerUpdateOneTodo = {
  route: '/todo',
  method: 'PUT',
  handlerType: 'context',
  run(context) {
    const { id, title, description } = context.fetchRequest().body;
    const todos = context.conductState('todos') || seedTodos();
    todos.set(`${id}`, { title, description });
    context.provideState('todos', todos);

    context.provideReply({ message: 'success' }).send();
  },
};

const handlerDeleteOneTodo = {
  route: '/todo/:todoId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    const todos = context.conductState('todos') || seedTodos();
    todos.delete(todoId);
    context.provideState('todos', todos);

    context.provideReply({ message: 'success', data: Object.fromEntries(todos) }).send();
  },
};

const loggingMiddleware = {
  run(req, res, next) {
    console.log('in logging middleware', req.body);
    const originalSend = res.send;
    res.send = (body) => {
      // only tag plain-object bodies — spreading a string/array/etc. here would mangle it
      // (e.g. a markdown string composed in from another module) instead of tagging it

      // okay, the problem is, some of the middlewares, which we are currently in, can ovverride the response, which could be a simple string value - to object instead...
      // hmm...
      // this is not good, ofcourse...
      // why the middleware to app1 should have access to the http context for app1?
      // we do need to apply them separately...
      // but how?
      // since we register same handlers and same middlewares?
      // but where do we do this?
      const isPlainObject = body !== null && typeof body === 'object' && !Array.isArray(body);
      const data = isPlainObject ? { ...body, logs: 'submitted' } : body;

      res.send = originalSend;
      return res.send(data);
    };

    next();
    console.log('after logging middleware');
  },
};

const verifyingMiddleware = {
  run(req, res, next) {
    console.log('in verifying middleware', req.body);

    next();
    console.log('after verifying middleware');
  },
};

const handlers = [
  handlerGetAllTodos,
  handlerFindOneTodo,
  handlerSubmitOneTodo,
  handlerUpdateOneTodo,
  handlerDeleteOneTodo,
];
const middlewares = [loggingMiddleware.run, verifyingMiddleware.run];

if (require.main === module) {
  serverBased({
    title: 'todo app',
    purpose: 'http api',
    version: '1.0',
    middlewares,
    handlers,
  })
    .run()
    .catch((error) => {
      console.error('todo app failed to start:', error.message);
      process.exit(1);
    });
}

module.exports = { handlers, middlewares };
