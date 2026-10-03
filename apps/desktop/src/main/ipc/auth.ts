import { app } from 'electron';
import { handle } from './handle.js';
import {
  credentialsArgs,
  emailVerificationConfirmArgs,
  heartbeatArgs,
  passwordResetConfirmArgs,
  passwordResetRequestArgs,
} from './schemas.js';
import { getDeviceIdentifier } from '../device.js';
import { loginWithCredentials, signupLocalAccount } from '../services/auth.js';
import { startGoogleSignIn } from '../services/oauth.js';
import {
  confirmEmailVerification,
  confirmPasswordReset,
  getEmailVerificationStatus,
  requestPasswordReset,
  sendVerificationEmail,
} from '../services/email-codes.js';
import { session, startHeartbeatLoop, stopHeartbeat } from '../services/session.js';
import { syncPullUserDataToLocalDb } from '../services/cloud-sync.js';

/** Sign-in flows, single-laptop heartbeat and cloud data pull. */
export function registerAuthIpc(): void {
  handle('auth-google', () => startGoogleSignIn());
  handle('auth-login', credentialsArgs, (credentials) => loginWithCredentials(credentials));
  handle('auth-signup', credentialsArgs, (credentials) => signupLocalAccount(credentials));

  // Password reset and email verification (migration 019, Edge Function send-email-code).
  handle('auth-request-password-reset', passwordResetRequestArgs, (input) => requestPasswordReset(input));
  handle('auth-confirm-password-reset', passwordResetConfirmArgs, (input) => confirmPasswordReset(input));
  handle('auth-send-verification', () => sendVerificationEmail());
  handle('auth-confirm-verification', emailVerificationConfirmArgs, (input) => confirmEmailVerification(input));
  handle('auth-verification-status', () => getEmailVerificationStatus());

  handle('start-heartbeat', heartbeatArgs, (opts) => {
    startHeartbeatLoop(opts.userId, opts.sessionToken, opts.deviceFingerprint);
    return { success: true };
  });
  handle('stop-heartbeat', () => {
    stopHeartbeat();
    return { success: true };
  });

  handle('sync-cloud-data', async () => {
    if (!session.userId || !session.sessionToken || !session.deviceFingerprint) {
      return { success: false, error: 'No active online session to sync.' };
    }
    const ok = await syncPullUserDataToLocalDb(session.userId, session.sessionToken, session.deviceFingerprint);
    return { success: ok, pulled: ok };
  });

  handle('get-device-info', () => getDeviceIdentifier(app.getPath('userData')));
}
