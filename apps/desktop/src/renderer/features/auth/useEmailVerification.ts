import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from '../../types';
import { normalizeCode } from './accountEmail';

export interface EmailVerificationState {
  /** null while unknown (loading, offline or not available): the UI shows nothing rather than guessing. */
  verified: boolean | null;
  email: string | null;
  loading: boolean;
  sending: boolean;
  confirming: boolean;
  /** True after a code was sent in this session. */
  codeSent: boolean;
  error: string | null;
  send: () => Promise<boolean>;
  confirm: (code: string) => Promise<boolean>;
  refresh: () => void;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Email verification status from the server (never assumed locally), plus send / confirm. */
export function useEmailVerification(userId: string | number | null | undefined): EmailVerificationState {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const api = getApi();
    if (!userId || !api.getEmailStatus) {
      setVerified(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    (async () => {
      try {
        const res = await api.getEmailStatus!();
        if (id !== reqId.current) return;
        if (res?.success) {
          setVerified(Boolean(res.verified));
          setEmail(res.email || null);
        } else {
          setVerified(null);
        }
      } catch {
        if (id === reqId.current) setVerified(null);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [userId, nonce]);

  const send = useCallback(async () => {
    const api = getApi();
    if (!api.sendVerificationEmail) return false;
    setSending(true);
    setError(null);
    try {
      const res = await api.sendVerificationEmail();
      if (!res?.success) {
        setError(res?.error || 'Could not send the email. Try again.');
        return false;
      }
      setCodeSent(true);
      return true;
    } catch (e) {
      setError(errMsg(e, 'Could not send the email. Try again.'));
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  const confirm = useCallback(async (code: string) => {
    const api = getApi();
    if (!api.confirmEmailVerification) return false;
    setConfirming(true);
    setError(null);
    try {
      const res = await api.confirmEmailVerification(normalizeCode(code));
      if (!res?.success) {
        setError(res?.error || 'Could not verify the code. Try again.');
        return false;
      }
      setVerified(true);
      return true;
    } catch (e) {
      setError(errMsg(e, 'Could not verify the code. Try again.'));
      return false;
    } finally {
      setConfirming(false);
    }
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { verified, email, loading, sending, confirming, codeSent, error, send, confirm, refresh };
}
