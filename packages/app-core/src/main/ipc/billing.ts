import { handle } from './handle.js';
import { getEntitlementsArgs, startCheckoutArgs, upiCreateOrderArgs, upiSubmitUtrArgs } from './schemas.js';
import { getEntitlements } from '../services/entitlements.js';
import { startCheckout } from '../services/checkout.js';
import { getPaymentHistory } from '../services/payment-history.js';
import { createUpiOrder, listUpiOrders, submitUpiUtr } from '../services/upi-payments.js';

/** Plan, limits and usage from the server; Razorpay checkout; UPI direct payments (035). */
export function registerBillingIpc(): void {
  handle('get-entitlements', getEntitlementsArgs, (options) => getEntitlements(options ?? {}));
  handle('start-checkout', startCheckoutArgs, (plan) => startCheckout(plan));
  handle('get-payment-history', () => getPaymentHistory());
  handle('upi-create-order', upiCreateOrderArgs, (plan) => createUpiOrder(plan));
  handle('upi-submit-utr', upiSubmitUtrArgs, (orderId, utr) => submitUpiUtr(orderId, utr));
  handle('upi-list-orders', () => listUpiOrders());
}
