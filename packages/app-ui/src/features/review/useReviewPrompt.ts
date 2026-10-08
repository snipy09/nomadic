import { useCallback, useEffect, useState } from 'react';
import { prefs } from '../../store/preferences';
import { PLATFORM } from '../../platform';
import { getApi } from '../../types';
import { ASK_DELAY_MS, snoozeOver, snoozeUntil, type ReviewForm } from './reviewLogic';

/**
 * Asks the server, a little after the app opens, whether the review is due for this account
 * (7 days old, no review yet). "Not now" is remembered on this device for a few days.
 */
export function useReviewPrompt(email: string | null, enabled: boolean) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!email || !enabled) return;
    const api = getApi();
    if (!api.appReviewStatus || !snoozeOver(prefs.getReviewSnoozedUntil(email), new Date())) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.appReviewStatus?.()
        .then((s) => { if (alive && s.due) setOpen(true); })
        .catch(() => { /* not asked this time */ });
    }, ASK_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [email, enabled]);

  const snooze = useCallback(() => {
    if (email && !sent) prefs.setReviewSnoozedUntil(email, snoozeUntil(new Date()));
    setOpen(false);
  }, [email, sent]);

  const submit = useCallback(async (form: ReviewForm): Promise<boolean> => {
    const api = getApi();
    if (!api.appReviewSubmit || form.recommend === null || form.sus.some((a) => a === null)) return false;
    setSending(true);
    setError(null);
    try {
      const res = await api.appReviewSubmit({
        platform: PLATFORM,
        sus: form.sus as number[],
        recommend: form.recommend,
        best: form.best.trim() || undefined,
        frustrating: form.frustrating.trim() || undefined,
      });
      if (!res.success) {
        setError(res.error ?? 'Your review could not be sent. Try again.');
        return false;
      }
      setSent(true);
      return true;
    } catch {
      setError('Your review could not be sent. Check your connection and try again.');
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  return { open, sending, error, sent, snooze, close: () => setOpen(false), submit };
}
