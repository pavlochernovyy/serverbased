const { serverBased } = require('../../lib/server-based');

const makeTodosData = () => {
  const todosData = new Map();
  todosData.set('1', { title: 't #1', description: 'd #1' });
  return todosData;
};

const todosData = makeTodosData();

const getTodosHandler = {
  route: '/todo',
  method: 'GET',
  run: (req, res) => {
    res.send({
      data: Object.fromEntries(todosData),
    });
  },
};

const findTodoHandler = {
  route: `/todo/:todoId`,
  method: 'GET',
  run(req, res) {
    const { todoId } = req.params;
    res.send({
      data: todosData.get(todoId),
    });
  },
};

const submitTodoHandler = {
  route: '/todo',
  method: 'POST',
  run(req, res) {
    const { id, title, description } = req.body;
    const todoId = `${id}`;
    const result = todosData.set(todoId, { title, description });
    const posted = result.has(todoId);
    res.send({
      message: posted ? 'todo created' : 'todo is not created',
    });
  },
};

const updateTodoHandler = {
  route: '/todo',
  method: 'PUT',
  run(req, res) {
    const { id, title, description } = req.body;
    todosData.set(`${id}`, { title, description });
    res.send({
      message: 'success',
    });
  },
};

serverBased({
  title: 'todo app',
  purpose: 'http api',
  version: '1.0',
  handlers: [getTodosHandler, findTodoHandler, submitTodoHandler, updateTodoHandler],
}).run();
