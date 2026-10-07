import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DirectoryContact,
  OutreachContactQuery,
  OutreachMessage,
  OutreachMessageInput,
  OutreachPerson,
  OutreachPersonInput,
  OutreachSmtpSettings,
  OutreachState,
} from '@nomadic/app-core/shared/ipc';

const EMPTY: OutreachState = { people: [], messages: [], sentToday: 0, sendLimit: 20 };
const NO_API = 'Outreach is not available in this build.';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

function noApi(): { ok: false; error: string } {
  return { ok: false, error: NO_API };
}

function api() {
  return typeof window !== 'undefined' ? window.api : undefined;
}

/** Local outreach state (people, messages, SMTP account) with mutations that refresh it. */
export function useOutreach() {
  const [state, setState] = useState<OutreachState>(EMPTY);
  const [smtp, setSmtp] = useState<OutreachSmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  const reload = useCallback(async () => {
    const a = api();
    const id = ++req.current;
    if (!a?.outreachGetState) {
      setLoading(false);
      setError(NO_API);
      return;
    }
    setLoading(true);
    try {
      const [s, m] = await Promise.all([a.outreachGetState(), a.outreachGetSmtp ? a.outreachGetSmtp() : Promise.resolve(null)]);
      if (id !== req.current) return;
      setState(s);
      setSmtp(m);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      setError(`Outreach did not load: ${e instanceof Error ? e.message : 'unknown error'}.`);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async <T extends { success: boolean; error?: string }>(call: () => Promise<T>): Promise<Outcome<T>> => {
      try {
        const r = await call();
        await reload();
        return r.success ? { ok: true, value: r } : { ok: false, error: r.error || 'That did not work. Try again.' };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'That did not work. Try again.' };
      }
    },
    [reload],
  );

  const savePerson = (input: OutreachPersonInput) => {
    const a = api();
    if (!a?.outreachSavePerson) return Promise.resolve(noApi());
    return run(() => a.outreachSavePerson!(input));
  };
  const deletePerson = (id: number) => {
    const a = api();
    if (!a?.outreachDeletePerson) return Promise.resolve(noApi());
    return run(() => a.outreachDeletePerson!(id));
  };
  const saveMessage = (input: OutreachMessageInput) => {
    const a = api();
    if (!a?.outreachSaveMessage) return Promise.resolve(noApi());
    return run(() => a.outreachSaveMessage!(input));
  };
  const deleteMessage = (id: number) => {
    const a = api();
    if (!a?.outreachDeleteMessage) return Promise.resolve(noApi());
    return run(() => a.outreachDeleteMessage!(id));
  };
  const reviewMessage = (id: number) => {
    const a = api();
    if (!a?.outreachReviewMessage) return Promise.resolve(noApi());
    return run(() => a.outreachReviewMessage!(id));
  };
  const sendMessage = (id: number) => {
    const a = api();
    if (!a?.outreachSendMessage) return Promise.resolve(noApi());
    return run(() => a.outreachSendMessage!(id));
  };
  const openMessage = (id: number, via: 'gmail' | 'mailto' | 'linkedin') => {
    const a = api();
    if (!a?.outreachOpenMessage) return Promise.resolve(noApi());
    return run(() => a.outreachOpenMessage!({ id, via }));
  };
  const markMessage = (id: number, status: 'sent' | 'replied' | 'no_reply' | 'bounced') => {
    const a = api();
    if (!a?.outreachMarkMessage) return Promise.resolve(noApi());
    return run(() => a.outreachMarkMessage!({ id, status }));
  };

  return {
    ...state,
    smtp,
    loading,
    error,
    reload,
    savePerson,
    deletePerson,
    saveMessage,
    deleteMessage,
    reviewMessage,
    sendMessage,
    openMessage,
    markMessage,
  };
}

/** Directory search against published contacts (server side, daily row limit per plan). */
export function useDirectorySearch() {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLeft, setRowsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const req = useRef(0);

  const search = useCallback(async (q: OutreachContactQuery) => {
    const a = api();
    const id = ++req.current;
    if (!a?.outreachListContacts) {
      setError(NO_API);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await a.outreachListContacts(q);
      if (id !== req.current) return;
      setSearched(true);
      if (r.success) {
        setContacts(r.contacts);
        setTotal(r.total);
        setRowsLeft(r.rowsLeftToday);
      } else {
        setContacts([]);
        setTotal(0);
        setError(r.error);
      }
    } catch (e) {
      if (id !== req.current) return;
      setError(`Search failed: ${e instanceof Error ? e.message : 'unknown error'}.`);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);

  return { contacts, total, rowsLeft, loading, error, searched, search };
}
