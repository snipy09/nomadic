import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, session, showSaveDialog, writeFileSync, wipeLocalData, stopHeartbeat, dbRows } = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: { userId: null as string | null, sessionToken: null as string | null, deviceFingerprint: null as string | null },
  showSaveDialog: vi.fn(),
  writeFileSync: vi.fn(),
  wipeLocalData: vi.fn().mockResolvedValue(undefined),
  stopHeartbeat: vi.fn(),
  dbRows: {} as Record<string, { columns: string[]; values: unknown[][] }>,
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/home/u/Downloads', getVersion: () => '1.0.6', getLocale: () => 'en-IN' },
  dialog: { showSaveDialog },
  clipboard: { writeText: vi.fn() },
}));
vi.mock('fs', async (orig) => {
  const real = await orig<typeof import('fs')>();
  return { ...real, default: { ...real, writeFileSync }, writeFileSync };
});
vi.mock('../db.js', () => ({
  getDb: () => ({
    exec: (sql: string) => {
      const table = sql.replace('SELECT * FROM ', '');
      return dbRows[table] ? [dbRows[table]] : [];
    },
  }),
  wipeLocalData,
  getLocalDbHealth: () => null,
  getLocalDbPath: () => '',
}));
vi.mock('../services/app-context.js', () => ({ log: vi.fn(), getMainWindow: () => null, getRecentLogLines: () => [] }));
vi.mock('../services/session.js', () => ({ session, stopHeartbeat }));
vi.mock('../services/supabase.js', () => ({ getAnonSupabase: () => ({ rpc }) }));
vi.mock('../services/auth.js', () => ({
  readLoginTicket: (row: Record<string, unknown>) => (typeof row?.login_ticket === 'string' ? row.login_ticket : undefined),
}));

import { collectLocalExport, deleteAccount, exportAccountData, exportFileName } from '../services/account-data';
import { formatDiagnostics, redactLine } from '../services/diagnostics';

const USER_ID = '77777777-7777-7777-7777-777777777777';

beforeEach(() => {
  rpc.mockReset();
  showSaveDialog.mockReset();
  writeFileSync.mockReset();
  wipeLocalData.mockClear();
  stopHeartbeat.mockClear();
  Object.assign(session, { userId: USER_ID, sessionToken: 'tok', deviceFingerprint: 'fp' });
  for (const k of Object.keys(dbRows)) delete dbRows[k];
  dbRows.master_profile = {
    columns: ['id', 'first_name', 'email', 'groq_api_key', 'smtp_password', 'gemini_api_key'],
    values: [[1, 'Asha', 'asha@example.com', 'gsk_secret', 'smtp-secret', 'AIza-secret']],
  };
  dbRows.local_applications = { columns: ['id', 'company'], values: [[1, 'Acme']] };
});

describe('account export', () => {
  it('never exports secrets from local tables', () => {
    const local = collectLocalExport();
    expect(local.master_profile).toEqual([{ id: 1, first_name: 'Asha', email: 'asha@example.com' }]);
    expect(JSON.stringify(local)).not.toMatch(/secret/);
    expect(local.local_applications).toEqual([{ id: 1, company: 'Acme' }]);
    expect(local.resumes).toEqual([]);
  });

  it('writes server and local data to the chosen file', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.json' });
    rpc.mockResolvedValue({ data: [{ ok: true, data: { account: { email: 'asha@example.com' } } }], error: null });

    const res = await exportAccountData();

    expect(res).toEqual({ success: true, filePath: '/tmp/out.json', serverIncluded: true });
    expect(rpc).toHaveBeenCalledWith('account_export_data', { p_user_id: USER_ID, p_session_token: 'tok', p_device_fingerprint: 'fp' });
    const doc = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(doc.format).toBe('nomadic-account-export');
    expect(doc.server).toEqual({ account: { email: 'asha@example.com' } });
    expect(doc.local.local_applications).toEqual([{ id: 1, company: 'Acme' }]);
  });

  it('still exports local data, and says why, when the server is unreachable', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out.json' });
    rpc.mockRejectedValue(new Error('ENOTFOUND'));

    const res = await exportAccountData();

    expect(res.serverIncluded).toBe(false);
    const doc = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(doc.server).toBe(null);
    expect(doc.serverError).toContain('Could not reach the server');
  });

  it('does nothing when the save dialog is cancelled', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true });
    expect(await exportAccountData()).toEqual({ success: false, canceled: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('names the file by date', () => {
    expect(exportFileName(new Date('2026-10-03T12:00:00Z'))).toBe('nomadic-export-2026-10-03.json');
  });
});

describe('account deletion', () => {
  const authOk = { data: [{ ok: true, id: USER_ID, login_ticket: 'fresh-ticket' }], error: null };

  it('re-authenticates, deletes on the server with the fresh ticket, then wipes local data', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'authenticate_user' ? authOk : { data: [{ ok: true, reason: 'deleted' }], error: null });

    expect(await deleteAccount({ confirmEmail: ' Asha@Example.com ', password: 'secret12' })).toEqual({ success: true });

    expect(rpc).toHaveBeenNthCalledWith(1, 'authenticate_user', { p_email: 'asha@example.com', p_password: 'secret12' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'account_delete', {
      p_user_id: USER_ID, p_session_token: 'tok', p_device_fingerprint: 'fp', p_login_ticket: 'fresh-ticket', p_confirm_email: 'asha@example.com',
    });
    expect(wipeLocalData).toHaveBeenCalledTimes(1);
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
    expect(session.userId).toBe(null);
  });

  it('keeps everything when the password is wrong', async () => {
    rpc.mockResolvedValue({ data: [{ ok: false, reason: 'Incorrect email or password.' }], error: null });
    expect(await deleteAccount({ confirmEmail: 'asha@example.com', password: 'nope' })).toEqual({ success: false, error: 'Incorrect email or password.' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(wipeLocalData).not.toHaveBeenCalled();
  });

  it('refuses another account\'s credentials', async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, id: 'someone-else', login_ticket: 't' }], error: null });
    expect((await deleteAccount({ confirmEmail: 'other@example.com', password: 'x' })).success).toBe(false);
    expect(wipeLocalData).not.toHaveBeenCalled();
  });

  it('keeps local data when the server does not confirm', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'authenticate_user' ? authOk : { data: [{ ok: false, reason: 'Unauthorized: Active session required.' }], error: null });
    expect(await deleteAccount({ confirmEmail: 'asha@example.com', password: 'secret12' })).toEqual({
      success: false, error: 'Unauthorized: Active session required.',
    });
    expect(wipeLocalData).not.toHaveBeenCalled();
    expect(session.userId).toBe(USER_ID);
  });

  it('needs an online session', async () => {
    Object.assign(session, { userId: null, sessionToken: null, deviceFingerprint: null });
    expect((await deleteAccount({ confirmEmail: 'a@b.co', password: 'x' })).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('diagnostics', () => {
  it('redacts emails, ids, tokens and user folders', () => {
    const line = redactLine('[Auth] Authenticated via Supabase: asha@example.com id 77777777-7777-7777-7777-777777777777 token=abc123 C:\\Users\\Asha\\AppData ticket: 0f'.concat('a'.repeat(40)));
    expect(line).not.toContain('asha@example.com');
    expect(line).not.toContain('77777777-7777');
    expect(line).not.toContain('abc123');
    expect(line).not.toContain('Asha\\');
    expect(line).toContain('<email>');
    expect(line).toContain('C:\\Users\\<user>');
  });

  it('formats a report with versions, database state and redacted logs', () => {
    const text = formatDiagnostics({
      generatedAt: '2026-10-03T10:00:00Z', appVersion: '1.0.6', electron: '31', chrome: '126', node: '20', os: 'win32 10.0 (x64)', locale: 'en-IN',
      database: {
        health: { startup: 'recovered_from_backup', migration: 'migrated', schemaVersion: 2, latestSchemaVersion: 2, integrity: 'ok', checkedAt: 'x' },
        sizeBytes: 1000, backups: 3, latestBackupAt: '2026-10-02', rowCounts: { local_applications: 4 },
      },
      signedIn: true, serverConfigured: true, recentLog: ['[x] saved for asha@example.com'],
    });
    expect(text).toContain('App: 1.0.6');
    expect(text).toContain('Schema v2 of v2; startup: recovered_from_backup');
    expect(text).toContain('local_applications=4');
    expect(text).toContain('Backups: 3');
    expect(text).not.toContain('asha@example.com');
  });
});
