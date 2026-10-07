import { handle } from './handle.js';
import { deleteAccountArgs } from './schemas.js';
import { copyDiagnostics, getDataHealth } from '../services/diagnostics.js';
import { deleteAccount, exportAccountData } from '../services/account-data.js';

/** Local data health, diagnostics, account export and deletion (F10). */
export function registerDataSafetyIpc(): void {
  handle('get-data-health', () => getDataHealth());
  handle('copy-diagnostics', () => copyDiagnostics());
  handle('export-account-data', () => exportAccountData());
  handle('delete-account', deleteAccountArgs, (input) => deleteAccount(input));
}
