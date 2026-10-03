import { dialog } from 'electron';
import path from 'path';
import type { PickResumeFileResult, ResumeInput, ResumeRecord } from '../../shared/ipc.js';
import { getDb, persistDb } from '../db.js';
import { getMainWindow, log } from './app-context.js';
import { deleteAndSyncResume, saveAndSyncResume } from './cloud-sync.js';

// ── Multi-Resume Management ─────────────────────────────────────────────────
export function getResumes(): ResumeRecord[] {
  try {
    const db = getDb();
    const results = db.exec('SELECT * FROM resumes ORDER BY is_default DESC, id DESC');
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map(row => {
      const obj = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      return {
        id: Number(obj['id']),
        name: String(obj['name'] ?? ''),
        targetRole: String(obj['target_role'] ?? ''),
        filePath: String(obj['file_path'] ?? ''),
        isDefault: Boolean(obj['is_default']),
        createdAt: String(obj['created_at'] ?? ''),
      };
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Resumes] Fetch error: ${msg}`);
    return [];
  }
}

export function saveResume(resume: ResumeInput): { success: boolean; error?: string } {
  try {
    saveAndSyncResume({
      name: String(resume['name'] ?? 'Resume'),
      targetRole: String(resume['targetRole'] ?? ''),
      filePath: String(resume['filePath'] ?? ''),
      isDefault: Boolean(resume['isDefault']),
    });
    log(`[Resumes] Registered resume: "${resume['name']}"`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Resumes] Save error: ${msg}`);
    return { success: false, error: msg };
  }
}

export function deleteResume(id: number): { success: boolean; error?: string } {
  try {
    deleteAndSyncResume(id);
    log(`[Resumes] Deleted resume ID: ${id}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Resumes] Delete error: ${msg}`);
    return { success: false, error: msg };
  }
}

export function setDefaultResume(id: number): { success: boolean; error?: string } {
  try {
    const db = getDb();
    db.run('UPDATE resumes SET is_default = 0');
    db.run('UPDATE resumes SET is_default = 1 WHERE id = ?', [id]);
    persistDb();
    log(`[Resumes] Set default resume ID: ${id}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Resumes] Default error: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function pickResumeFile(): Promise<PickResumeFileResult> {
  try {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      title: 'Select Resume File',
      properties: ['openFile'],
      filters: [
        { name: 'Resumes (PDF, DOCX, TXT)', extensions: ['pdf', 'docx', 'doc', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    return { canceled: false, filePath, fileName };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Resumes] File picker error: ${msg}`);
    return { canceled: true };
  }
}
