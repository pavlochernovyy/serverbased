// Second plugin demo: pure pricing logic, decoupled from CartPlugin — it takes a cart's items
// as plain input rather than reaching into another plugin, so it works for any items shape.
const BULK_ITEM_THRESHOLD = 5;
const BULK_DISCOUNT_RATE = 0.1;

const round2 = (value) => Math.round(value * 100) / 100;

class SalePlugin {
  calculateTotal(items) {
    const cartItems = Object.values(items);
    const itemCount = cartItems.reduce((count, item) => count + (item.qty || 0), 0);
    const subtotal = round2(cartItems.reduce((sum, item) => sum + item.price * item.qty, 0));

    const bulkDiscountApplied = itemCount > BULK_ITEM_THRESHOLD;
    const discount = bulkDiscountApplied ? round2(subtotal * BULK_DISCOUNT_RATE) : 0;
    const total = round2(subtotal - discount);

    return { itemCount, subtotal, discount, total, bulkDiscountApplied };
  }
}

module.exports = { SalePlugin, BULK_ITEM_THRESHOLD, BULK_DISCOUNT_RATE };
