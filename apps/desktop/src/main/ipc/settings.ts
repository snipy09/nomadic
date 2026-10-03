import { handle } from './handle.js';
import { checkDependencies, installDependencies } from '../services/system.js';

/**
 * Settings screen: dependency health. There is no user API key to test any more: AI calls go
 * through the server-side AI proxy, which holds the operator's key (DECISIONS #12).
 */
export function registerSettingsIpc(): void {
  handle('check-dependencies', () => checkDependencies());
  handle('install-dependencies', () => installDependencies());
}
