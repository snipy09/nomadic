import { handle } from './handle.js';
import { resumeIdArgs, saveMasterProfileArgs, saveResumeArgs } from './schemas.js';
import { getMasterProfileRow, saveMasterProfile } from '../services/profile.js';
import { deleteResume, getResumes, pickResumeFile, saveResume, setDefaultResume } from '../services/resumes.js';

/** Master profile and resume library. */
export function registerProfileIpc(): void {
  handle('get-master-profile', () => getMasterProfileRow());
  handle('save-master-profile', saveMasterProfileArgs, (p) => saveMasterProfile(p));
  handle('get-resumes', () => getResumes());
  handle('save-resume', saveResumeArgs, (resume) => saveResume(resume));
  handle('delete-resume', resumeIdArgs, (id) => deleteResume(id));
  handle('set-default-resume', resumeIdArgs, (id) => setDefaultResume(id));
  handle('pick-resume-file', () => pickResumeFile());
}
