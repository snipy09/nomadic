import { describe, it, expect, vi } from 'vitest';
import {
  sendSessionHeartbeat,
  getSupabaseClient,
  registerDeviceSession,
  syncPullUserData,
  syncPushUserProfile,
  syncPushApplication,
  syncDeleteApplication,
  syncPushSavedJob,
  syncRemoveSavedJob,
  syncHideJob,
  syncUnhideJob,
  syncPullHiddenJobs,
  syncSetApplicationFollowUp,
  syncPushResume,
  syncDeleteResume,
  handleRazorpaySuccessRpc,
  learningRecordEvents,
  learningPullEvents,
  learningStartTrack,
  learningGetTracks
} from '../index.js';

describe('Supabase Package Unit Tests', () => {
  describe('getSupabaseClient', () => {
    it('creates a client instance with provided URL and key', () => {
      const client = getSupabaseClient('https://mock.supabase.co', 'mock-key');
      expect(client).toBeDefined();
      expect(typeof client.rpc).toBe('function');
    });
  });

  describe('registerDeviceSession', () => {
    it('successfully registers device session with no conflict', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: true, conflict: false, reason: 'Session registered successfully' }],
          error: null,
        }),
      };

      const res = await registerDeviceSession(
        mockSupabase,
        'user-1',
        'tok-1',
        'fp-laptop-1',
        'MacBook Pro',
        '1.2.3.4',
        false
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('register_device_session', {
        p_user_id: 'user-1',
        p_session_token: 'tok-1',
        p_device_fingerprint: 'fp-laptop-1',
        p_device_name: 'MacBook Pro',
        p_client_ip: '1.2.3.4',
        p_force_takeover: false,
      });
      expect(res.ok).toBe(true);
      expect(res.conflict).toBe(false);
    });

    it('sends the login ticket as p_login_ticket when one is given', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [{ ok: true, conflict: false }], error: null }),
      };

      await registerDeviceSession(mockSupabase, 'user-1', 'tok-1', 'fp-1', 'Laptop', '1.2.3.4', true, 'ticket-abc');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('register_device_session', {
        p_user_id: 'user-1',
        p_session_token: 'tok-1',
        p_device_fingerprint: 'fp-1',
        p_device_name: 'Laptop',
        p_client_ip: '1.2.3.4',
        p_force_takeover: true,
        p_login_ticket: 'ticket-abc',
      });
    });

    it('omits p_login_ticket when no ticket is available', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [{ ok: true, conflict: false }], error: null }),
      };

      await registerDeviceSession(mockSupabase, 'user-1', 'tok-1', 'fp-1', 'Laptop', '1.2.3.4', false, null);

      expect(mockSupabase.rpc.mock.calls[0][1]).not.toHaveProperty('p_login_ticket');
    });

    it('detects active device conflict and returns activeDevice info', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: false, conflict: true, active_device: 'Dell XPS 15', reason: 'Account active on another device' }],
          error: null,
        }),
      };

      const res = await registerDeviceSession(
        mockSupabase,
        'user-1',
        'tok-1',
        'fp-laptop-2',
        'HP Pavilion',
        '1.2.3.4',
        false
      );

      expect(res.ok).toBe(false);
      expect(res.conflict).toBe(true);
      expect(res.activeDevice).toBe('Dell XPS 15');
    });
  });

  describe('sendSessionHeartbeat', () => {
    it('returns valid true when RPC call succeeds with valid session', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { is_valid: true },
          error: null,
        }),
      };

      const res = await sendSessionHeartbeat(
        mockSupabase,
        'user-123',
        'token-abc',
        '192.168.1.1',
        'fp-device-1'
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('verify_and_update_session', {
        p_user_id: 'user-123',
        p_session_token: 'token-abc',
        p_client_ip: '192.168.1.1',
        p_device_fingerprint: 'fp-device-1',
      });
      expect(res.valid).toBe(true);
      expect(res.reason).toBeUndefined();
    });

    it('returns valid false when RPC reports session invalid due to device conflict', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { is_valid: false, reason: 'Device conflict detected' },
          error: null,
        }),
      };

      const res = await sendSessionHeartbeat(
        mockSupabase,
        'user-123',
        'token-abc',
        '10.0.0.1',
        'fp-device-1'
      );

      expect(res.valid).toBe(false);
      expect(res.reason).toBe('Device conflict detected');
    });
  });

  describe('syncPullUserData', () => {
    it('successfully pulls cloud user data', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{
            ok: true,
            profile: { first_name: 'John', tech_stack: 'React, Node' },
            applications: [{ company: 'Google', title: 'SWE', apply_url: 'https://google.com' }],
            saved_jobs: [{ title: 'Frontend Engineer', company: 'Stripe', apply_url: 'https://stripe.com' }],
            resumes: [{ name: 'SWE Resume', is_default: true }]
          }],
          error: null,
        }),
      };

      const res = await syncPullUserData(mockSupabase, 'user-1', 'tok-1', 'fp-1');
      expect(res.ok).toBe(true);
      expect(res.data?.profile).toEqual({ first_name: 'John', tech_stack: 'React, Node' });
      expect(res.data?.applications).toHaveLength(1);
      expect(res.data?.savedJobs).toHaveLength(1);
      expect(res.data?.resumes).toHaveLength(1);
    });
  });

  describe('syncPushUserProfile', () => {
    it('pushes profile data to cloud', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: true }],
          error: null,
        }),
      };

      const res = await syncPushUserProfile(mockSupabase, 'user-1', 'tok-1', 'fp-1', {
        first_name: 'Jane',
        desired_title: 'Full Stack Engineer'
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('sync_push_user_profile', {
        p_user_id: 'user-1',
        p_session_token: 'tok-1',
        p_device_fingerprint: 'fp-1',
        p_profile: {
          first_name: 'Jane',
          desired_title: 'Full Stack Engineer'
        }
      });
      expect(res.ok).toBe(true);
    });
  });

  describe('syncPushApplication', () => {
    it('pushes application to cloud', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: true }],
          error: null,
        }),
      };

      const res = await syncPushApplication(mockSupabase, 'user-1', 'tok-1', 'fp-1', {
        company: 'Vercel',
        title: 'Platform Engineer',
        apply_url: 'https://vercel.com/apply'
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('sync_push_application', {
        p_user_id: 'user-1',
        p_session_token: 'tok-1',
        p_device_fingerprint: 'fp-1',
        p_company: 'Vercel',
        p_title: 'Platform Engineer',
        p_apply_url: 'https://vercel.com/apply',
        p_status: 'applied',
        p_mode: 'autonomous'
      });
      expect(res.ok).toBe(true);
    });

    it('sends notes, history and applied date only when given', async () => {
      const mockSupabase = { rpc: vi.fn().mockResolvedValue({ data: [{ ok: true }], error: null }) };
      const history = [{ status: 'applied', changed_at: '2026-10-01T10:00:00.000Z' }, { status: 'interviewing', changed_at: '2026-10-02T10:00:00.000Z' }];
      await syncPushApplication(mockSupabase, 'user-1', 'tok-1', 'fp-1', {
        company: 'Vercel', title: 'Platform Engineer', apply_url: 'https://vercel.com/apply',
        status: 'interviewing', mode: 'manual', notes: '', status_history: history, applied_at: '2026-10-01T10:00:00.000Z',
      });
      const params = mockSupabase.rpc.mock.calls[0][1];
      expect(params.p_notes).toBe('');
      expect(params.p_status_history).toEqual(history);
      expect(params.p_applied_at).toBe('2026-10-01T10:00:00.000Z');
    });
  });

  describe('syncDeleteApplication', () => {
    it('deletes by apply URL and surfaces RPC errors', async () => {
      const ok = { rpc: vi.fn().mockResolvedValue({ data: [{ ok: true }], error: null }) };
      expect((await syncDeleteApplication(ok, 'u', 't', 'f', 'https://a.co/1')).ok).toBe(true);
      expect(ok.rpc).toHaveBeenCalledWith('sync_delete_application', {
        p_user_id: 'u', p_session_token: 't', p_device_fingerprint: 'f', p_apply_url: 'https://a.co/1',
      });
      const bad = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }) };
      expect(await syncDeleteApplication(bad, 'u', 't', 'f', 'x')).toEqual({ ok: false, error: 'denied' });
    });
  });

  describe('syncPushSavedJob & syncRemoveSavedJob', () => {
    it('pushes and removes saved job on cloud', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: true }],
          error: null,
        }),
      };

      const pushRes = await syncPushSavedJob(mockSupabase, 'user-1', 'tok-1', 'fp-1', {
        title: 'Backend Dev',
        company: 'Supabase',
        apply_url: 'https://supabase.com/jobs/1'
      });
      expect(pushRes.ok).toBe(true);

      const remRes = await syncRemoveSavedJob(mockSupabase, 'user-1', 'tok-1', 'fp-1', 'https://supabase.com/jobs/1');
      expect(remRes.ok).toBe(true);
    });
  });

  describe('hidden jobs and follow-ups (026)', () => {
    const ok = () => ({ rpc: vi.fn().mockResolvedValue({ data: [{ ok: true }], error: null }) });

    it('hides and unhides with the session arguments', async () => {
      const sb = ok();
      expect(await syncHideJob(sb, 'u', 't', 'f', { apply_url: 'https://x/1', title: 'SDE', company: 'Acme' })).toEqual({ ok: true, error: undefined });
      expect(sb.rpc).toHaveBeenCalledWith('sync_hide_job', {
        p_user_id: 'u', p_session_token: 't', p_device_fingerprint: 'f',
        p_apply_url: 'https://x/1', p_title: 'SDE', p_company: 'Acme',
      });
      expect((await syncUnhideJob(sb, 'u', 't', 'f', 'https://x/1')).ok).toBe(true);
      expect(sb.rpc).toHaveBeenLastCalledWith('sync_unhide_job', expect.objectContaining({ p_apply_url: 'https://x/1' }));
    });

    it('pulls hidden jobs and drops malformed rows', async () => {
      const sb = { rpc: vi.fn().mockResolvedValue({ data: [{ ok: true, hidden_jobs: [
        { apply_url: 'https://x/1', title: 'SDE', company: 'Acme', hidden_at: '2026-10-01T00:00:00Z' },
        { apply_url: '' }, null, { title: 'no url' },
      ] }], error: null }) };
      const res = await syncPullHiddenJobs(sb, 'u', 't', 'f');
      expect(res).toEqual({ ok: true, jobs: [{ apply_url: 'https://x/1', title: 'SDE', company: 'Acme', hidden_at: '2026-10-01T00:00:00Z' }] });
    });

    it('reports a rejected pull or a missing function', async () => {
      const denied = { rpc: vi.fn().mockResolvedValue({ data: [{ ok: false, error: 'Unauthorized' }], error: null }) };
      expect(await syncPullHiddenJobs(denied, 'u', 't', 'f')).toEqual({ ok: false, error: 'Unauthorized' });
      const missing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }) };
      expect(await syncHideJob(missing, 'u', 't', 'f', { apply_url: 'x' })).toEqual({ ok: false, error: 'function not found' });
    });

    it('sets and clears a follow-up date', async () => {
      const sb = ok();
      await syncSetApplicationFollowUp(sb, 'u', 't', 'f', 'https://x/1', '2026-10-20');
      expect(sb.rpc).toHaveBeenCalledWith('sync_set_application_follow_up', expect.objectContaining({ p_apply_url: 'https://x/1', p_follow_up_at: '2026-10-20' }));
      await syncSetApplicationFollowUp(sb, 'u', 't', 'f', 'https://x/1', null);
      expect(sb.rpc).toHaveBeenLastCalledWith('sync_set_application_follow_up', expect.objectContaining({ p_follow_up_at: null }));
    });
  });

  describe('syncPushResume & syncDeleteResume', () => {
    it('pushes and deletes resume on cloud', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: true }],
          error: null,
        }),
      };

      const pushRes = await syncPushResume(mockSupabase, 'user-1', 'tok-1', 'fp-1', {
        name: 'Resume 2026',
        target_role: 'Full Stack',
        is_default: true
      });
      expect(pushRes.ok).toBe(true);

      const delRes = await syncDeleteResume(mockSupabase, 'user-1', 'tok-1', 'fp-1', 'Resume 2026');
      expect(delRes.ok).toBe(true);
    });
  });

  describe('handleRazorpaySuccessRpc', () => {
    it('updates user tier and inserts billing record on successful payment', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [{ ok: true, user_id: 'user-123', new_tier: 'pro', expires_at: '2026-09-30T00:00:00Z', reason: 'Subscription upgraded successfully!' }],
          error: null,
        }),
      };

      const res = await handleRazorpaySuccessRpc(mockSupabase, {
        userId: 'user-123',
        email: 'candidate@example.com',
        plan: 'pro',
        amount: '299.00',
        paymentId: 'pay_ABC12345678',
        orderId: 'order_XYZ9876543',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('handle_razorpay_payment_success', {
        p_user_id: 'user-123',
        p_email: 'candidate@example.com',
        p_plan: 'pro',
        p_amount: '299.00',
        p_payment_id: 'pay_ABC12345678',
        p_order_id: 'order_XYZ9876543',
      });
      expect(res.ok).toBe(true);
      expect(res.reason).toBe('Subscription upgraded successfully!');
    });
  });

  describe('learning RPCs', () => {
    const sess = ['user-1', 'tok', 'fp'] as const;

    it('records events and reports accepted / rejected counts', async () => {
      const rpc = vi.fn().mockResolvedValue({ data: [{ accepted: 3, rejected: 1, error: null }], error: null });
      const events = [{ id: 'e1', type: 'quiz_passed', skill_id: 's', item_id: 'i', payload: {}, duration_s: 0, created_at: '2026-10-01T00:00:00Z' }];
      expect(await learningRecordEvents({ rpc }, ...sess, events)).toEqual({ ok: true, accepted: 3, rejected: 1 });
      expect(rpc).toHaveBeenCalledWith('learning_record_events', { p_user_id: 'user-1', p_session_token: 'tok', p_device_fingerprint: 'fp', p_events: events });
    });

    it('treats a server-side error row (e.g. unauthorized) as a failure', async () => {
      const rpc = vi.fn().mockResolvedValue({ data: [{ accepted: 0, rejected: 0, error: 'unauthorized' }], error: null });
      expect(await learningRecordEvents({ rpc }, ...sess, [])).toMatchObject({ ok: false, error: 'unauthorized' });
    });

    it('pulls events since a cursor and starts tracks', async () => {
      const rpc = vi.fn()
        .mockResolvedValueOnce({ data: [{ id: 'e1' }], error: null })
        .mockResolvedValueOnce({ data: [{ ok: false, error: 'free_tier_track_limit' }], error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'function learning_get_tracks does not exist' } });
      expect((await learningPullEvents({ rpc }, ...sess, '2026-10-01T00:00:00Z')).events).toHaveLength(1);
      expect(rpc.mock.calls[0][1].p_since).toBe('2026-10-01T00:00:00Z');
      expect(await learningStartTrack({ rpc }, ...sess, { track_id: 'frontend', horizon_months: 3, daily_hours: 2 })).toEqual({ ok: false, error: 'free_tier_track_limit' });
      expect(await learningGetTracks({ rpc }, ...sess)).toMatchObject({ ok: false, tracks: [] });
    });
  });
});
