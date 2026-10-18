import { registerPlugin } from '@capacitor/core';
import type { OAuthCallbackPayload } from '@nomadic/app-core/shared/ipc';
import { sendToRenderer } from '@nomadic/app-core/main/services/app-context';
import { signInWithGoogleIdToken } from '@nomadic/app-core/main/services/oauth';

/**
 * Phone version of `auth-google`: the system account picker (Credential Manager, GoogleSignInPlugin.java) returns a
 * Google ID token issued to the web client id below, with our nonce. From there it is the desktop path: the
 * google-sign-in Edge Function verifies it and the session starts like password sign-in (single device, ticket).
 * The result reaches the sign-in screen through `oauth-callback`, as on the desktop; errors are returned directly.
 */

export interface GooglePlugin {
  signIn(options: { serverClientId: string; nonce: string }): Promise<{ idToken: string }>;
}

export interface GoogleDeps {
  clientId: string;
  plugin: GooglePlugin;
  signIn: (idToken: string, opts: { nonce: string; forceTakeover: boolean }) => Promise<OAuthCallbackPayload>;
  emit: (payload: OAuthCallbackPayload) => void;
}

export const GOOGLE_CANCELLED = 'Google sign-in was cancelled.';

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let running = false;

export async function phoneGoogleSignIn(
  deps: GoogleDeps,
  options: { forceTakeover?: boolean } = {},
): Promise<{ success: boolean; error?: string }> {
  if (!deps.clientId) return { success: false, error: 'Google sign-in is not configured for this build.' };
  if (running) return { success: false, error: 'Google sign-in is already open.' };
  running = true;
  try {
    const nonce = randomNonce();
    let idToken: string;
    try {
      idToken = (await deps.plugin.signIn({ serverClientId: deps.clientId, nonce })).idToken;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'cancelled') return { success: false, error: GOOGLE_CANCELLED };
      if (code === 'no_account') return { success: false, error: 'Add a Google account to this phone in Settings, then try again.' };
      return { success: false, error: 'Google sign-in could not start on this phone. Sign in with email and password.' };
    }
    if (!idToken) return { success: false, error: 'Google did not return a sign-in.' };
    const result = await deps.signIn(idToken, { nonce, forceTakeover: Boolean(options.forceTakeover) });
    if (!result.success && !result.conflict) return { success: false, error: result.error || 'Google sign-in failed.' };
    deps.emit(result);
    return { success: true };
  } finally {
    running = false;
  }
}

export function defaultGoogleDeps(clientId: string): GoogleDeps {
  return {
    clientId,
    plugin: registerPlugin<GooglePlugin>('NomadicGoogle'),
    signIn: (idToken, opts) => signInWithGoogleIdToken(idToken, opts),
    emit: (payload) => sendToRenderer('oauth-callback', payload),
  };
}
