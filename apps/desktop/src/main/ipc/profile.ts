import { handle } from './handle.js';
import { documentTextArgs, draftAnswersArgs, rememberedAnswerUpdateArgs, resumeIdArgs, saveMasterProfileArgs, saveResumeArgs } from './schemas.js';
import { getDb, persistDb } from '../db.js';
import { readDocumentText } from '../services/document-text.js';
import { clearRememberedAnswers, listRememberedAnswers, updateRememberedAnswer } from '../services/form-answers.js';
import { getMasterProfileRow, saveMasterProfile } from '../services/profile.js';
import { draftProfileAnswers } from '../services/profile-drafts.js';
import { deleteResume, getResumes, pickResumeFile, saveResume, setDefaultResume } from '../services/resumes.js';

/** Master profile, resume library and stored application answers. */
export function registerProfileIpc(): void {
  handle('read-document-text', documentTextArgs, (input) => readDocumentText(input));
  handle('draft-profile-answers', draftAnswersArgs, (input) => draftProfileAnswers(input));
  handle('remembered-answers-list', () => listRememberedAnswers(getDb()));
  handle('remembered-answers-update', rememberedAnswerUpdateArgs, ({ key, answer }) => {
    const changed = updateRememberedAnswer(getDb(), key, answer);
    if (changed) persistDb();
    return changed ? { success: true } : { success: false, error: 'That answer is no longer saved.' };
  });
  handle('remembered-answers-clear', () => {
    clearRememberedAnswers(getDb());
    persistDb();
    return { success: true };
  });
  handle('get-master-profile', () => getMasterProfileRow());
  handle('save-master-profile', saveMasterProfileArgs, (p) => saveMasterProfile(p));
  handle('get-resumes', () => getResumes());
  handle('save-resume', saveResumeArgs, (resume) => saveResume(resume));
  handle('delete-resume', resumeIdArgs, (id) => deleteResume(id));
  handle('set-default-resume', resumeIdArgs, (id) => setDefaultResume(id));
  handle('pick-resume-file', () => pickResumeFile());
}
