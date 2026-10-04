import { handle } from './handle.js';
import {
  outreachDraftAiArgs,
  outreachIdArgs,
  outreachListContactsArgs,
  outreachMarkMessageArgs,
  outreachOpenMessageArgs,
  outreachReportContactArgs,
  outreachSaveMessageArgs,
  outreachSavePersonArgs,
  outreachSaveSmtpArgs,
} from './schemas.js';
import {
  clearSmtpSettings,
  deleteOutreachMessage,
  deleteOutreachPerson,
  draftOutreachWithAi,
  getOutreachState,
  getSmtpSettings,
  listDirectoryContacts,
  markOutreachMessage,
  openOutreachMessage,
  reportDirectoryContact,
  reviewOutreachMessage,
  saveOutreachMessage,
  saveOutreachPerson,
  saveSmtpSettings,
  sendOutreachMessage,
} from '../services/outreach.js';

/** Outreach: contact directory, people and reviewed messages, the user's SMTP account. */
export function registerOutreachIpc(): void {
  handle('outreach-list-contacts', outreachListContactsArgs, (q) => listDirectoryContacts(q));
  handle('outreach-report-contact', outreachReportContactArgs, (input) => reportDirectoryContact(input));
  handle('outreach-get-state', () => getOutreachState());
  handle('outreach-save-person', outreachSavePersonArgs, (input) => saveOutreachPerson(input));
  handle('outreach-delete-person', outreachIdArgs, (id) => deleteOutreachPerson(id));
  handle('outreach-save-message', outreachSaveMessageArgs, (input) => saveOutreachMessage(input));
  handle('outreach-delete-message', outreachIdArgs, (id) => deleteOutreachMessage(id));
  handle('outreach-review-message', outreachIdArgs, (id) => reviewOutreachMessage(id));
  handle('outreach-send-message', outreachIdArgs, (id) => sendOutreachMessage(id));
  handle('outreach-open-message', outreachOpenMessageArgs, (input) => openOutreachMessage(input));
  handle('outreach-mark-message', outreachMarkMessageArgs, (input) => markOutreachMessage(input));
  handle('outreach-draft-ai', outreachDraftAiArgs, (input) => draftOutreachWithAi(input));
  handle('outreach-get-smtp', () => getSmtpSettings());
  handle('outreach-save-smtp', outreachSaveSmtpArgs, (input) => saveSmtpSettings(input));
  handle('outreach-clear-smtp', () => clearSmtpSettings());
}