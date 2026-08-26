const { serverBased } = require('../../lib/server-based');

const storage = {
  todos: new Map([['1', { title: 't #1', description: 'd #1' }]]),
};

const handlerGetAllTodos = {
  route: '/todo',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    context
      .provideReply({
        data: Object.fromEntries(storage.todos),
      })
      .send();
  },
};

const handlerFindOneTodo = {
  route: '/todo/:todoId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    context
      .provideReply({
        data: storage.todos.get(todoId) || {},
      })
      .send();
  },
};

const handlerSubmitOneTodo = {
  route: '/todo',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, title, description } = context.fetchRequest().body;
    const todoId = `${id}`;
    const result = storage.todos.set(todoId, { title, description });
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
    storage.todos.set(`${id}`, { title, description });
    context.provideReply({ message: 'success' }).send();
  },
};

const handlerDeleteOneTodo = {
  route: '/todo/:todoId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    storage.todos.delete(todoId);
    context.provideReply({ message: 'success', data: Object.fromEntries(storage.todos) }).send();
  },
};

const loggingMiddleware = {
  run(req, res, next) {
    console.log('in logging middleware', req.body);
    const originalSend = res.send;
    res.send = (body) => {
      const data = {
        ...body,
        logs: 'submitted',
      };

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

serverBased({
  title: 'todo app',
  purpose: 'http api',
  version: '1.0',
  middlewares: [loggingMiddleware.run, verifyingMiddleware.run],
  handlers: [handlerGetAllTodos, handlerFindOneTodo, handlerSubmitOneTodo, handlerUpdateOneTodo, handlerDeleteOneTodo],
}).run();
