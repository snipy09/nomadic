import { describe, expect, it } from 'vitest';
import {
  normalizeCode, resetSentMessage, validateCode, validateResetConfirm, validateResetEmail,
} from '../features/auth/accountEmail';

describe('accountEmail logic', () => {
  it('keeps only digits, up to 8', () => {
    expect(normalizeCode('1234 5678')).toBe('12345678');
    expect(normalizeCode('1234-5678-9')).toBe('12345678');
    expect(normalizeCode('abc')).toBe('');
  });

  it('validates the email for a reset request', () => {
    expect(validateResetEmail('')).toBe('Enter your email.');
    expect(validateResetEmail('nope')).toBe('Enter a valid email address.');
    expect(validateResetEmail(' a@b.co ')).toBe(undefined);
  });

  it('requires a full 8-digit code', () => {
    expect(validateCode('')).toBe('Enter the code from the email.');
    expect(validateCode('1234')).toBe('The code has 8 digits.');
    expect(validateCode('1234 5678')).toBe(undefined);
  });

  it('validates the new password and its confirmation', () => {
    expect(validateResetConfirm({ code: '12345678', newPassword: '', confirmPassword: '' })).toEqual({ newPassword: 'Enter a new password.' });
    expect(validateResetConfirm({ code: '12345678', newPassword: '123', confirmPassword: '123' })).toEqual({ newPassword: 'Use at least 6 characters.' });
    expect(validateResetConfirm({ code: '12345678', newPassword: 'secret12', confirmPassword: 'secret13' })).toEqual({ confirmPassword: 'The passwords do not match.' });
    expect(validateResetConfirm({ code: '12345678', newPassword: 'secret12', confirmPassword: 'secret12' })).toEqual({});
  });

  it('words the sent message the same for any email', () => {
    expect(resetSentMessage(' A@B.co ')).toBe('If a@b.co has a Nomadic account, we sent it an 8-digit code. It expires in 30 minutes.');
  });
});
