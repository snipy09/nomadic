import { handle } from './handle.js';
import {
  adminContentHistoryArgs,
  adminListAuditArgs,
  adminListContentArgs,
  adminListUpiOrdersArgs,
  adminListUsersArgs,
  adminReviewUpiOrderArgs,
  adminScrapeHealthArgs,
  adminSetResourceStatusArgs,
  adminSetUserPlanArgs,
  adminSetUserStatusArgs,
  adminUpdateLessonArgs,
} from './schemas.js';
import {
  contentHistory,
  listAudit,
  listContent,
  listUpiOrders,
  listUsers,
  reviewUpiOrder,
  scrapeHealth,
  setResourceStatus,
  setUserPlan,
  setUserStatus,
  updateLesson,
} from '../services/admin.js';

/**
 * Admin tools. Each handler calls a session-checked RPC (migration 014) with the
 * signed-in device session; the server decides whether the caller is an admin.
 */
export function registerAdminIpc(): void {
  handle('admin-list-users', adminListUsersArgs, (query) => listUsers(query));
  handle('admin-set-user-plan', adminSetUserPlanArgs, (input) => setUserPlan(input));
  handle('admin-set-user-status', adminSetUserStatusArgs, (input) => setUserStatus(input));
  handle('admin-list-audit', adminListAuditArgs, (query) => listAudit(query));
  handle('admin-scrape-health', adminScrapeHealthArgs, (days) => scrapeHealth(days));
  handle('admin-list-content', adminListContentArgs, (query) => listContent(query));
  handle('admin-update-lesson', adminUpdateLessonArgs, (input) => updateLesson(input));
  handle('admin-set-resource-status', adminSetResourceStatusArgs, (input) => setResourceStatus(input));
  handle('admin-content-history', adminContentHistoryArgs, (query) => contentHistory(query));
  handle('admin-list-upi-orders', adminListUpiOrdersArgs, (query) => listUpiOrders(query));
  handle('admin-review-upi-order', adminReviewUpiOrderArgs, (input) => reviewUpiOrder(input));
}
