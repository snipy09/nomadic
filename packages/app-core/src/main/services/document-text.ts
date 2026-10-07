import { dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import type { DocumentTextInput, DocumentTextResult } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { getMainWindow, log } from './app-context.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

/** Whitespace-normalised text, at most MAX_TEXT_CHARS. */
export function cleanDocumentText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

function resumePath(id: number): string | null {
  const res = getDb().exec('SELECT file_path FROM resumes WHERE id = ?', [id]);
  const v = res[0]?.values[0]?.[0];
  return typeof v === 'string' && v ? v : null;
}

/**
 * Text of a saved resume or of a PDF/TXT the user picks (a LinkedIn "Save to PDF" export).
 * The text stays on the computer unless the user later asks for AI drafts.
 */
export async function readDocumentText(input: DocumentTextInput): Promise<DocumentTextResult> {
  let filePath: string | null;
  if (input.resumeId !== undefined) {
    filePath = resumePath(input.resumeId);
    if (!filePath) return { success: false, error: 'That resume is no longer saved.' };
  } else {
    const picked = await dialog.showOpenDialog(getMainWindow()!, {
      title: 'Choose your LinkedIn PDF or resume',
      properties: ['openFile'],
      filters: [{ name: 'PDF or text', extensions: ['pdf', 'txt'] }],
    });
    if (picked.canceled || !picked.filePaths.length) return { success: false, canceled: true };
    filePath = picked.filePaths[0];
  }
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf' && ext !== '.txt') {
    return { success: false, fileName, error: 'Nomadic can read PDF and TXT files. Save the document as a PDF and try again.' };
  }
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_BYTES) return { success: false, fileName, error: 'This file is larger than 10 MB.' };
    const buf = await fs.readFile(filePath);
    const text = cleanDocumentText(ext === '.pdf' ? await pdfText(buf) : buf.toString('utf8'));
    if (text.length < 40) {
      return { success: false, fileName, error: 'No readable text was found. A scanned PDF has no text; export the document as a PDF from Word or Google Docs.' };
    }
    return { success: true, text, fileName };
  } catch (err: unknown) {
    log(`[Documents] Could not read ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, fileName, error: 'Nomadic could not read this file. Check that it opens on your computer.' };
  }
}
