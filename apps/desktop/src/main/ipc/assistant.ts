import { handle } from './handle.js';
import { assistantArgs } from './schemas.js';
import { askNomadicAssistant } from '../services/assistant.js';

/** Max-plan Nomadic Assistant. */
export function registerAssistantIpc(): void {
  handle('ask-nomadic-assistant', assistantArgs, (data) => askNomadicAssistant(data));
}
