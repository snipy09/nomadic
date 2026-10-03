import { handle } from './handle.js';
import { testGroqKeyArgs } from './schemas.js';
import { checkDependencies, installDependencies, testGroqKey } from '../services/system.js';

/** Settings screen: dependency health and API key checks. */
export function registerSettingsIpc(): void {
  handle('check-dependencies', () => checkDependencies());
  handle('install-dependencies', () => installDependencies());
  handle('test-groq-key', testGroqKeyArgs, (key) => testGroqKey(key));
}
