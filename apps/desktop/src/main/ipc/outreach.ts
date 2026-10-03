import { handle } from './handle.js';
import { aiOutreachArgs, emailArgs, sendOutreachArgs, targetRoleArgs } from './schemas.js';
import { generateAiOutreachEmail, getHrContacts, sendOutreach, verifyEmail } from '../services/outreach.js';

/** Recruiter contacts, email verification and outreach dispatch. */
export function registerOutreachIpc(): void {
  handle('verify-email', emailArgs, (email) => verifyEmail(email));
  handle('get-hr-contacts', targetRoleArgs, (targetRole) => getHrContacts(targetRole));
  handle('send-outreach', sendOutreachArgs, (contacts) => sendOutreach(contacts));
  handle('generate-ai-outreach-email', aiOutreachArgs, (params) => generateAiOutreachEmail(params));
}
