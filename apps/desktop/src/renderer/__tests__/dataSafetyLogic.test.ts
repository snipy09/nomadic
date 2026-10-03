import { describe, expect, it } from 'vitest';
import { describeHealth, formatBackupLine, formatBytes, validateDelete } from '../features/data-safety/dataSafetyLogic';

const base = { startup: 'ok', migration: 'up_to_date', schemaVersion: 2, latestSchemaVersion: 2 } as const;

describe('data safety logic', () => {
  it('describes each startup outcome, problems first', () => {
    expect(describeHealth(base).tone).toBe('success');
    expect(describeHealth({ ...base, migration: 'failed', startup: 'recovered_from_backup' }).title).toBe('Database update failed');
    expect(describeHealth({ ...base, migration: 'newer_than_app' }).tone).toBe('warning');
    expect(describeHealth({ ...base, startup: 'recovered_from_backup' }).title).toBe('Restored from backup');
    expect(describeHealth({ ...base, startup: 'reset_after_corruption' }).tone).toBe('danger');
    expect(describeHealth(null).title).toBe('Local data status unknown');
  });

  it('formats sizes and backups', () => {
    expect(formatBytes(null)).toBe('Unknown');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBackupLine(0, null)).toContain('No backups yet');
    expect(formatBackupLine(1, null)).toContain('1 backup kept');
  });

  it('requires the exact account email and a password to delete', () => {
    expect(validateDelete({ confirmEmail: '', password: '' }, 'a@b.co')).toEqual({ confirmEmail: 'Type your account email.', password: 'Enter your password.' });
    expect(validateDelete({ confirmEmail: 'x@b.co', password: 'p' }, 'a@b.co')).toEqual({ confirmEmail: 'This does not match your account email.' });
    expect(validateDelete({ confirmEmail: ' A@B.co ', password: 'p' }, 'a@b.co')).toEqual({});
  });
});
