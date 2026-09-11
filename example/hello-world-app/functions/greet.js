const handlerGreet = {
  route: '/hello/:name',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { name } = context.fetchRequest().params;
    context.provideReply({ message: `hello, ${name}` }).send();
  },
};

module.exports = { handlers: [handlerGreet] };
