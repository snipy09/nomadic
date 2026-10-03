/**
 * Resume file resolution and the PDF injector (moved from omni-form-solver).
 * The generated PDF contains only facts from the profile; nothing is invented.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { MasterProfile } from './profile.js';

/** Existing resume file for the profile (explicit path, else default resume), or null. */
export function existingResumePath(profile: MasterProfile): string | null {
  if (profile.resumeFilePath && fs.existsSync(profile.resumeFilePath)) return profile.resumeFilePath;
  if (Array.isArray(profile.resumes) && profile.resumes.length > 0) {
    const def = profile.resumes.find((r) => r.isDefault) || profile.resumes[0];
    if (def?.filePath && fs.existsSync(def.filePath)) return def.filePath;
  }
  return null;
}

const pdfEscape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');

/** Build a minimal, valid single-page PDF (correct xref offsets) from text lines. */
export function buildPdf(lines: string[]): string {
  const content = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 50 ${730 - i * 22} Td (${pdfEscape(line)}) Tj ET`)
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/**
 * Returns a resume path: the candidate's file when present, otherwise a PDF
 * generated from profile facts (name, contact, title, skills, summary) when
 * `allowGenerate` is true. Returns null when neither is possible.
 */
export function ensureResumeFile(profile: MasterProfile, allowGenerate = true, dir?: string): string | null {
  const existing = existingResumePath(profile);
  if (existing) return existing;
  if (!allowGenerate) return null;
  const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.fullName || '';
  if (!name || !profile.email) return null;
  const lines = [
    [name, profile.desiredTitle || profile.currentTitle].filter(Boolean).join(' - '),
    [profile.email, profile.phone, profile.location].filter(Boolean).join(' | '),
    [profile.linkedin, profile.github, profile.portfolio].filter(Boolean).join(' | '),
    profile.currentCompany ? `Current: ${[profile.currentTitle, profile.currentCompany].filter(Boolean).join(' at ')}` : '',
    profile.techStack ? `Skills: ${profile.techStack}` : '',
    ...(profile.summaryText ? wrap(profile.summaryText, 95) : []),
    profile.university ? `Education: ${[profile.degree, profile.fieldOfStudy, profile.university, profile.graduationYear].filter(Boolean).join(', ')}` : '',
  ].filter(Boolean);
  const outDir = dir || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp') : os.tmpdir());
  const file = path.join(outDir, `Nomadic_Resume_${name.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
  try {
    fs.writeFileSync(file, buildPdf(lines), 'latin1');
    return file;
  } catch {
    return null;
  }
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
