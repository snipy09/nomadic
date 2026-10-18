import QRCode from 'qrcode';
import type { UpiOrder } from '@nomadic/app-core/shared/ipc';

/** A UTR (UPI transaction reference) is 12 digits; payment apps often show it with spaces. */
export function normaliseUtr(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export function isValidUtr(input: string): boolean {
  return /^\d{12}$/.test(normaliseUtr(input));
}

/**
 * QR code for `text` as one SVG path (1 unit per module, no quiet zone), drawn inline so the
 * content security policy needs no data: images.
 */
export function qrPath(text: string): { size: number; d: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const parts: string[] = [];
  for (let r = 0; r < modules.size; r++) {
    for (let c = 0; c < modules.size; c++) {
      if (modules.get(r, c)) parts.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return { size: modules.size, d: parts.join('') };
}

/** One line about where a submitted order stands, or null while it is still with the user. */
export function upiReviewLine(order: UpiOrder | null | undefined): string | null {
  if (!order) return null;
  if (order.status === 'submitted') return 'Payment sent for review. We check it against our bank statement, usually within a few hours.';
  if (order.status === 'approved') return 'Payment approved. Your plan is active.';
  if (order.status === 'rejected') return `Payment not approved${order.reviewNote ? `: ${order.reviewNote}` : '.'} Contact support if you were charged.`;
  return null;
}
