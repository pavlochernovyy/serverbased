// A function loaded via serverbased.json (see ../serverbased.json), mounted at /cart.
// Brings its own named "cart" plugin (functions/plugins/cart.plugin.js), reachable as
// context.cart inside its own handlers only — in-process, isolated from every other function.
const { CartPlugin } = require('./plugins/cart.plugin');

const handlerGetCart = {
  route: '/:cartId',
  method: 'GET',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    context.provideReply({ data: context.cart.getItems(cartId) }).send();
  },
};

const handlerAddItem = {
  route: '/:cartId/items',
  method: 'POST',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    const { id, name, price, qty } = context.fetchRequest().body;
    const items = context.cart.addItem(cartId, { id, name, price, qty });

    context.provideReply({ message: 'item added', data: items }).sendWithCode(201);
  },
};

const handlerRemoveItem = {
  route: '/:cartId/items/:itemId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { cartId, itemId } = context.fetchRequest().params;
    const items = context.cart.removeItem(cartId, itemId);

    context.provideReply({ message: 'item removed', data: items }).send();
  },
};

const handlerClearCart = {
  route: '/:cartId',
  method: 'DELETE',
  handlerType: 'context',
  run(context) {
    const { cartId } = context.fetchRequest().params;
    context.cart.clearCart(cartId);

    context.provideReply({ message: 'cart cleared' }).send();
  },
};

module.exports = {
  handlers: [handlerGetCart, handlerAddItem, handlerRemoveItem, handlerClearCart],
  plugins: [{ name: 'cart', plugin: CartPlugin }],
};
