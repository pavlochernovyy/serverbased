const { serverBased } = require('../../lib/server-based');

const storage = {
  todos: new Map([['1', { title: 't #1', description: 'd #1' }]]),
};

const handlerGetAllTodos = {
  route: '/todo',
  method: 'GET',
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
  run(context) {
    const { id, title, description } = context.fetchRequest().body;
    storage.todos.set(`${id}`, { title, description });
    context.provideReply({ message: 'success' }).send();
  },
};

const handlerDeleteOneTodo = {
  route: '/todo/:todoId',
  method: 'DELETE',
  run(context) {
    const { todoId } = context.fetchRequest().params;
    storage.todos.delete(todoId);
    context.provideReply({ message: 'success', data: Object.fromEntries(storage.todos) }).send();
  },
};

serverBased({
  title: 'todo app',
  purpose: 'http api',
  version: '1.0',
  handlers: [handlerGetAllTodos, handlerFindOneTodo, handlerSubmitOneTodo, handlerUpdateOneTodo, handlerDeleteOneTodo],
}).run();
