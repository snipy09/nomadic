import { handle } from './handle.js';
import { getEntitlementsArgs, startCheckoutArgs } from './schemas.js';
import { getEntitlements } from '../services/entitlements.js';
import { startCheckout } from '../services/checkout.js';

/** Plan, limits and usage from the server; Razorpay checkout. */
export function registerBillingIpc(): void {
  handle('get-entitlements', getEntitlementsArgs, (options) => getEntitlements(options ?? {}));
  handle('start-checkout', startCheckoutArgs, (plan) => startCheckout(plan));
}
