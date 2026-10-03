import { app } from 'electron';
import { handle } from './handle.js';
import {
  confirmEmailVerificationArgs, confirmPasswordResetArgs, credentialsArgs, heartbeatArgs, requestPasswordResetArgs,
} from './schemas.js';
import { getDeviceIdentifier } from '../device.js';
import { loginWithCredentials, signupLocalAccount } from '../services/auth.js';
import { startGoogleSignIn } from '../services/oauth.js';
import {
  confirmEmailVerification, confirmPasswordReset, getEmailStatus, requestPasswordReset, sendVerificationEmail,
} from '../services/account-email.js';
import { session, startHeartbeatLoop, stopHeartbeat } from '../services/session.js';
import { syncPullUserDataToLocalDb } from '../services/cloud-sync.js';

/** Sign-in flows, single-laptop heartbeat and cloud data pull. */
export function registerAuthIpc(): void {
  handle('auth-google', () => startGoogleSignIn());
  handle('auth-login', credentialsArgs, (credentials) => loginWithCredentials(credentials));
  handle('auth-signup', credentialsArgs, (credentials) => signupLocalAccount(credentials));
  handle('auth-request-password-reset', requestPasswordResetArgs, (email) => requestPasswordReset(email));
  handle('auth-confirm-password-reset', confirmPasswordResetArgs, (input) => confirmPasswordReset(input));
  handle('auth-send-verification-email', () => sendVerificationEmail());
  handle('auth-confirm-email-verification', confirmEmailVerificationArgs, (code) => confirmEmailVerification(code));
  handle('auth-email-status', () => getEmailStatus());

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
