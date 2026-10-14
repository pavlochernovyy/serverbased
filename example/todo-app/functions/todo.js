const { TodoStorePlugin } = require('./plugins/todo-store.plugin');

// A function loaded via serverbased.json (see ../serverbased.json), mounted at /todo. Overrides
// the default "store" plugin with TodoStorePlugin (functions/plugins/todo-store.plugin.js),
// pre-seeded with one todo — no per-handler seedTodos() fallback needed.
const handlerGetAllTodos = {
  route: '/',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const todos = context.conductState('todos');

    context.provideReply({ data: Object.fromEntries(todos) }).send();
  },
};

const handlerFindOneTodo = {
  route: '/:todoId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    const todos = context.conductState('todos');

    context.provideReply({ data: todos.get(todoId) || {} }).send();
  },
};

const handlerSubmitOneTodo = {
  route: '/',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, title, description } = context.fetchRequest().body;
    const todos = context.conductState('todos');
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
  route: '/',
  method: 'PUT',
  handlerType: 'context',
  run(context) {
    const { id, title, description } = context.fetchRequest().body;
    const todos = context.conductState('todos');
    todos.set(`${id}`, { title, description });
    context.provideState('todos', todos);

    context.provideReply({ message: 'success' }).send();
  },
};

const handlerDeleteOneTodo = {
  route: '/:todoId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    const todos = context.conductState('todos');
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
      res.send = originalSend;
      return res.send({ ...body, logs: 'submitted' });
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

module.exports = {
  handlers: [handlerGetAllTodos, handlerFindOneTodo, handlerSubmitOneTodo, handlerUpdateOneTodo, handlerDeleteOneTodo],
  middlewares: [loggingMiddleware.run, verifyingMiddleware.run],
  plugins: [{ name: 'store', plugin: TodoStorePlugin }],
};
