import { handle } from './handle.js';
import {
  adminCreateUserArgs,
  assignPlanArgs,
  billingRecordArgs,
  curatedResourceArgs,
  idArgs,
  idStatusArgs,
} from './schemas.js';
import {
  addLearningResource,
  assignPlan,
  createBillingRecord,
  createUser,
  deleteLearningResource,
  deleteUser,
  getBilling,
  getLearningResources,
  getMetrics,
  getUsers,
  updateUserStatus,
} from '../services/admin.js';

/** Operator-only admin dashboard (requires the service-role key to be useful). */
export function registerAdminIpc(): void {
  handle('admin-get-users', () => getUsers());
  handle('admin-create-user', adminCreateUserArgs, (user) => createUser(user));
  handle('admin-update-user-status', idStatusArgs, (data) => updateUserStatus(data));
  handle('admin-delete-user', idArgs, (id) => deleteUser(id));
  handle('admin-get-billing', () => getBilling());
  handle('admin-create-billing-record', billingRecordArgs, (record) => createBillingRecord(record));
  handle('admin-get-metrics', () => getMetrics());
  handle('admin-assign-plan', assignPlanArgs, (data) => assignPlan(data));
  handle('admin-get-learning-resources', () => getLearningResources());
  handle('admin-add-learning-resource', curatedResourceArgs, (resource) => addLearningResource(resource));
  handle('admin-delete-learning-resource', idArgs, (id) => deleteLearningResource(id));
}
