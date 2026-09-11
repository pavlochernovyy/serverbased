// Proves a function loaded via serverbased.json can bring its own named plugin, reachable
// as context.cart inside its own handlers — same mechanism serverBased()'s top-level `plugins`
// already uses (see lib/server-based.js's registerHandlers/injectContext), just wired through
// the function loop instead. In-process, via context — not an HTTP call to another route.
const { CartPlugin } = require('./plugins/cart.plugin');

const handlerAddItem = {
  route: '/items',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { id, name } = context.fetchRequest().body;
    const items = context.cart.addItem({ id, name });
    context.provideReply({ data: items }).sendWithCode(201);
  },
};

const handlerListItems = {
  route: '/items',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    context.provideReply({ data: context.cart.getItems() }).send();
  },
};

module.exports = {
  handlers: [handlerAddItem, handlerListItems],
  plugins: [{ name: 'cart', plugin: CartPlugin }],
};
